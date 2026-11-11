import hashlib
import json
import os
from datetime import timedelta
from uuid import uuid7

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.engine import make_url
from starlette.websockets import WebSocketDisconnect

from app.care.models import CareAssignmentModel
from app.care.policies import utcnow
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import RefreshSessionModel, UserModel
from app.whatsapp.models import (
    WhatsAppConnection,
    WhatsAppContact,
    WhatsAppMessage,
    WhatsAppSocketTicket,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


@pytest.fixture
async def realtime_data(monkeypatch):
    users = [
        UserModel(
            id=uuid7(),
            name=name,
            email=f"rt-{uuid7()}@example.com",
            password_hash=PasswordHasher().hash("SyntheticRealtime123!"),
            role=role,
            status=UserStatus.ACTIVE,
        )
        for name, role in (
            ("Nutri Fictícia Tempo Real", UserRole.NUTRITIONIST),
            ("Paciente Fictício Tempo Real", UserRole.PATIENT),
            ("Outra Nutri Fictícia", UserRole.NUTRITIONIST),
            ("Admin Fictício Tempo Real", UserRole.ADMIN),
        )
    ]
    nutri, patient, other, admin = users
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(users)
        await db.flush()
        contacts = []
        for professional in (nutri, other):
            link = CareAssignmentModel(
                patient_id=patient.id,
                nutritionist_id=professional.id,
                actor_id=admin.id,
                ended_at=utcnow() if professional is other else None,
            )
            conn = WhatsAppConnection(
                nutritionist_id=professional.id, phone_number_id=str(uuid7().int % 10**14)
            )
            db.add_all([link, conn])
            await db.flush()
            contact = WhatsAppContact(
                connection_id=conn.id, assignment_id=link.id, phone="5585999990000"
            )
            db.add(contact)
            await db.flush()
            contacts.append(contact)
    monkeypatch.setattr(get_settings(), "whatsapp_enabled", True)
    monkeypatch.setattr(get_settings(), "whatsapp_pilot_nutritionist_id", nutri.id)
    monkeypatch.setattr(get_settings(), "cors_origins", ["http://localhost:5173"])
    monkeypatch.setattr("app.whatsapp.realtime.CHECK_INTERVAL", 0.05)
    return users, contacts


def login(client, user):
    response = client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "SyntheticRealtime123!"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def ticket(client, headers):
    response = client.post("/api/v1/whatsapp/realtime-ticket", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["ticket"]


@pytest.mark.asyncio
async def test_socket_ticket_single_use_origin_isolation_and_revocation(realtime_data):
    users, contacts = realtime_data
    nutri, patient, other, admin = users
    own, foreign = contacts
    origin = {"origin": "http://localhost:5173"}
    with TestClient(app) as client:
        for user in (patient, other, admin):
            assert (
                client.post(
                    "/api/v1/whatsapp/realtime-ticket", headers=login(client, user)
                ).status_code
                == 403
            )
        headers = login(client, nutri)
        for malformed in ("invalid-ticket", b"binary-frame"):
            with client.websocket_connect("/api/v1/whatsapp/realtime", headers=origin) as invalid:
                if isinstance(malformed, bytes):
                    invalid.send_bytes(malformed)
                else:
                    invalid.send_text(malformed)
                with pytest.raises(WebSocketDisconnect) as rejected:
                    invalid.receive_json()
                assert rejected.value.code == 1008
        raw = ticket(client, headers)
        async with AsyncSessionLocal() as db:
            saved = await db.get(WhatsAppSocketTicket, hashlib.sha256(raw.encode()).hexdigest())
            assert saved is not None and saved.ticket_hash != raw
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "/api/v1/whatsapp/realtime", headers={"origin": "https://evil.invalid"}
            ):
                pass
        with client.websocket_connect("/api/v1/whatsapp/realtime", headers=origin) as ws:
            ws.send_text(raw)
            assert ws.receive_json() == {"type": "ready"}
            with client.websocket_connect("/api/v1/whatsapp/realtime", headers=origin) as replay:
                replay.send_text(raw)
                with pytest.raises(WebSocketDisconnect):
                    replay.receive_json()
            # Different professionals' notifications must not reach this socket.
            async with AsyncSessionLocal() as db, db.begin():
                db.add(
                    WhatsAppMessage(
                        contact_id=foreign.id,
                        direction="inbound",
                        text="Privada",
                        status="received",
                        occurred_at=utcnow(),
                    )
                )
            async with AsyncSessionLocal() as db, db.begin():
                db.add(
                    WhatsAppMessage(
                        contact_id=own.id,
                        direction="inbound",
                        text="Texto fictício",
                        status="received",
                        occurred_at=utcnow(),
                    )
                )
            event = ws.receive_json()
            assert event == {"type": "whatsapp.conversation_changed", "contact_id": str(own.id)}
            assert "Texto fictício" not in json.dumps(event)
            # Revoke the HTTP session: an already-open socket must also close.
            async with AsyncSessionLocal() as db, db.begin():
                await db.execute(
                    update(RefreshSessionModel)
                    .where(RefreshSessionModel.user_id == nutri.id)
                    .values(revoked_at=utcnow())
                )
            with pytest.raises(WebSocketDisconnect) as closed:
                ws.receive_json()
            assert closed.value.code == 1008


@pytest.mark.asyncio
async def test_expired_ticket_and_account_disable(realtime_data):
    users, _ = realtime_data
    nutri = users[0]
    origin = {"origin": "http://localhost:5173"}
    with TestClient(app) as client:
        headers = login(client, nutri)
        raw = ticket(client, headers)
        async with AsyncSessionLocal() as db, db.begin():
            await db.execute(
                update(WhatsAppSocketTicket)
                .where(WhatsAppSocketTicket.ticket_hash == hashlib.sha256(raw.encode()).hexdigest())
                .values(expires_at=utcnow() - timedelta(seconds=1))
            )
        with client.websocket_connect("/api/v1/whatsapp/realtime", headers=origin) as ws:
            ws.send_text(raw)
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()
        raw = ticket(client, headers)
        with client.websocket_connect("/api/v1/whatsapp/realtime", headers=origin) as ws:
            ws.send_text(raw)
            assert ws.receive_json()["type"] == "ready"
            async with AsyncSessionLocal() as db, db.begin():
                row = await db.get(UserModel, nutri.id)
                row.status = UserStatus.BLOCKED
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()


@pytest.mark.asyncio
async def test_notify_only_after_commit_and_never_after_rollback(realtime_data):
    _, contacts = realtime_data
    own = contacts[0]
    conninfo = (
        make_url(get_settings().database_url)
        .set(drivername="postgresql")
        .render_as_string(hide_password=False)
    )
    async with await psycopg.AsyncConnection.connect(conninfo, autocommit=True) as listener:
        await listener.execute("LISTEN nutri_whatsapp_changes")
        async with AsyncSessionLocal() as db:
            db.add(
                WhatsAppMessage(
                    contact_id=own.id,
                    direction="inbound",
                    text="Rollback fictício",
                    status="received",
                    occurred_at=utcnow(),
                )
            )
            await db.flush()
            assert [n async for n in listener.notifies(timeout=0.1, stop_after=1)] == []
            await db.rollback()
        assert [n async for n in listener.notifies(timeout=0.1, stop_after=1)] == []
        async with AsyncSessionLocal() as db, db.begin():
            db.add(
                WhatsAppMessage(
                    contact_id=own.id,
                    direction="inbound",
                    text="Commit fictício",
                    status="received",
                    occurred_at=utcnow(),
                )
            )
        notifications = [n async for n in listener.notifies(timeout=2, stop_after=1)]
        assert len(notifications) == 1
        assert json.loads(notifications[0].payload)["contact_id"] == str(own.id)
