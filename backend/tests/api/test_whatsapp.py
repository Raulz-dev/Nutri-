import hashlib
import hmac
import json
import os
from uuid import UUID, uuid4, uuid7

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.care.models import CareAssignmentModel
from app.care.policies import utcnow
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel
from app.whatsapp.models import WhatsAppConnection, WhatsAppContact, WhatsAppEvent, WhatsAppMessage
from app.whatsapp.worker import deliver_one, process_event

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


@pytest.mark.asyncio
async def test_whatsapp_pilot_end_to_end_permissions_events_delivery_and_history(monkeypatch):
    password = "SyntheticPilot123!"
    hashed = PasswordHasher().hash(password)
    users = [
        UserModel(
            id=uuid7(),
            name=f"Fictício WhatsApp {chr(65 + index)}",
            email=f"wa-{uuid7()}@example.com",
            password_hash=hashed,
            role=role,
            status=UserStatus.ACTIVE,
        )
        for index, role in enumerate(
            [UserRole.ADMIN, UserRole.NUTRITIONIST, UserRole.PATIENT, UserRole.NUTRITIONIST]
        )
    ]
    admin, nutri, patient, outsider = users
    assignment = CareAssignmentModel(
        id=uuid7(), patient_id=patient.id, nutritionist_id=nutri.id, actor_id=admin.id
    )
    phone_id = str(uuid7().int % 10**14)
    connection = WhatsAppConnection(id=uuid7(), nutritionist_id=nutri.id, phone_number_id=phone_id)
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(users)
        await db.flush()
        db.add_all([assignment, connection])
        other_link = CareAssignmentModel(
            patient_id=patient.id, nutritionist_id=outsider.id, actor_id=admin.id, ended_at=utcnow()
        )
        other_connection = WhatsAppConnection(
            nutritionist_id=outsider.id, phone_number_id=str(uuid7().int % 10**14)
        )
        db.add_all([other_link, other_connection])
        await db.flush()
        other_contact = WhatsAppContact(
            connection_id=other_connection.id, assignment_id=other_link.id, phone="5585999990000"
        )
        db.add(other_contact)
        await db.flush()
        other_message = WhatsAppMessage(
            contact_id=other_contact.id,
            direction="outbound",
            text="Fila de outro profissional",
            status="queued",
            occurred_at=utcnow(),
        )
        other_event = WhatsAppEvent(
            connection_id=other_connection.id,
            event_key=str(uuid7()),
            payload="different-encryption-key",
        )
        db.add_all([other_message, other_event])
        await db.flush()
    settings = get_settings()
    for name, value in {
        "whatsapp_enabled": True,
        "whatsapp_sends_enabled": True,
        "whatsapp_pilot_nutritionist_id": nutri.id,
        "whatsapp_phone_number_id": phone_id,
        "whatsapp_app_secret": "synthetic-secret",
        "whatsapp_verify_token": "synthetic-verify",
        "whatsapp_graph_version": "v25.0",
        "whatsapp_allowed_phones": ["5585999990000", "5585999990001"],
        "outbox_encryption_key": Fernet.generate_key().decode(),
    }.items():
        monkeypatch.setattr(settings, name, value)
    dispatched = []

    def fake_meta(phone, text, local_id):
        dispatched.append((phone, text, local_id))
        return "sent", f"wamid.out.{local_id}", None

    monkeypatch.setattr("app.whatsapp.worker.send_to_meta", fake_meta)
    with TestClient(app) as client:

        def auth(user):
            result = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            assert result.status_code == 200, result.text
            return {"Authorization": f"Bearer {result.json()['access_token']}"}

        nh = auth(nutri)
        for user in (admin, patient, outsider):
            headers = auth(user)
            assert not client.get("/api/v1/whatsapp/availability", headers=headers).json()[
                "enabled"
            ]
            for path in ("/connection", "/contacts"):
                assert client.get("/api/v1/whatsapp" + path, headers=headers).status_code == 403
        assert client.get("/api/v1/whatsapp/contacts").status_code in (401, 403)
        assert (
            client.get(
                "/api/v1/whatsapp/webhook",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "synthetic-verify",
                    "hub.challenge": "challenge-123",
                },
            ).text
            == "challenge-123"
        )
        assert (
            client.get(
                "/api/v1/whatsapp/webhook",
                params={"hub.mode": "subscribe", "hub.verify_token": "wrong"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/v1/whatsapp/contacts",
                headers=nh,
                json={"patient_id": str(patient.id), "phone": "5511999990000"},
            ).status_code
            == 422
        )
        result = client.post(
            "/api/v1/whatsapp/contacts",
            headers=nh,
            json={"patient_id": str(patient.id), "phone": "5585999990000"},
        )
        assert result.status_code == 201, result.text
        contact_id = result.json()["id"]
        base = f"/api/v1/whatsapp/contacts/{contact_id}"
        for user in (admin, patient, outsider):
            denied = auth(user)
            assert client.get(base + "/messages", headers=denied).status_code == 403
            assert (
                client.post(
                    base + "/messages", headers=denied, json={"id": str(uuid4()), "text": "Negado"}
                ).status_code
                == 403
            )
            assert client.post(base + "/read", headers=denied, json={"ids": []}).status_code == 403
            assert (
                client.post(
                    "/api/v1/whatsapp/contacts",
                    headers=denied,
                    json={"patient_id": str(patient.id), "phone": "5585999990000"},
                ).status_code
                == 403
            )
        assert (
            client.post(
                base + "/messages", headers=nh, json={"id": str(uuid4()), "text": "Sem janela"}
            ).status_code
            == 409
        )

        def webhook(messages=None, statuses=None, signature=True, phone_id=phone_id):
            raw = json.dumps(
                {
                    "object": "whatsapp_business_account",
                    "entry": [
                        {
                            "changes": [
                                {
                                    "value": {
                                        "metadata": {"phone_number_id": phone_id},
                                        "messages": messages or [],
                                        "statuses": statuses or [],
                                    }
                                }
                            ]
                        }
                    ],
                }
            ).encode()
            digest = hmac.new(b"synthetic-secret", raw, hashlib.sha256).hexdigest()
            return client.post(
                "/api/v1/whatsapp/webhook",
                content=raw,
                headers={"x-hub-signature-256": "sha256=" + digest if signature else "invalid"},
            )

        inbound = {
            "id": "wamid.in." + str(uuid7()),
            "from": "5585999990000",
            "timestamp": str(int(utcnow().timestamp())),
            "type": "text",
            "text": {"body": "Mensagem fictícia"},
        }
        assert webhook([inbound], signature=False).status_code == 403
        assert webhook([inbound], phone_id="other").status_code == 200
        assert webhook([{**inbound, "from": "5585999990001"}]).status_code == 200
        assert webhook([inbound]).status_code == 200
        assert webhook([inbound]).status_code == 200
        async with AsyncSessionLocal() as db:
            events = (
                await db.scalars(
                    select(WhatsAppEvent).where(WhatsAppEvent.connection_id == connection.id)
                )
            ).all()
            assert len(events) == 1
            assert "Mensagem fictícia" not in events[0].payload
        assert await process_event()
        assert not await process_event()
        rows = client.get(base + "/messages", headers=nh).json()["items"]
        assert len(rows) == 1 and rows[0]["text"] == "Mensagem fictícia"
        assert client.get("/api/v1/whatsapp/contacts", headers=nh).json()["items"][0]["unread"] == 1
        assert (
            client.post(base + "/read", headers=nh, json={"ids": [rows[0]["id"]]}).status_code
            == 204
        )
        data = {"id": str(uuid4()), "text": "Resposta fictícia"}
        assert client.post(base + "/messages", headers=nh, json=data).status_code == 201
        assert client.post(base + "/messages", headers=nh, json=data).status_code == 201
        assert (
            client.post(
                base + "/messages", headers=nh, json={**data, "text": "Diferente"}
            ).status_code
            == 409
        )
        monkeypatch.setattr(settings, "whatsapp_sends_enabled", False)
        assert not await deliver_one()
        assert not dispatched
        assert (
            client.post(
                base + "/messages", headers=nh, json={"id": str(uuid4()), "text": "Pausado"}
            ).status_code
            == 409
        )
        monkeypatch.setattr(settings, "whatsapp_sends_enabled", True)
        assert await deliver_one()
        assert len(dispatched) == 1
        assert not await deliver_one()
        external = f"wamid.out.{data['id']}"
        for status in ("read", "sent", "failed", "delivered"):
            assert (
                webhook(
                    statuses=[
                        {
                            "id": external,
                            "recipient_id": "5585999990000",
                            "timestamp": str(int(utcnow().timestamp())),
                            "status": status,
                        }
                    ]
                ).status_code
                == 200
            )
            assert await process_event()
        rows = client.get(base + "/messages", headers=nh).json()["items"]
        assert next(row for row in rows if row["id"] == data["id"])["status"] == "read"
        # Client UUID4 IDs and delayed provider timestamps must not break pagination.
        first = client.get(base + "/messages?limit=1", headers=nh).json()
        second = client.get(
            base + f"/messages?limit=1&before={first['next_cursor']}", headers=nh
        ).json()
        assert len(first["items"]) == len(second["items"]) == 1
        assert first["items"][0]["id"] != second["items"][0]["id"]
        assert client.get(base + f"/messages?before={uuid4()}", headers=nh).status_code == 422
        # A lost response can be reconciled by opaque callback data without re-sending.
        uncertain_id = str(uuid4())
        monkeypatch.setattr(
            "app.whatsapp.worker.send_to_meta",
            lambda *args: ("unknown", None, "delivery_uncertain"),
        )
        assert (
            client.post(
                base + "/messages", headers=nh, json={"id": uncertain_id, "text": "Entrega incerta"}
            ).status_code
            == 201
        )
        assert await deliver_one()
        assert not await deliver_one()
        assert (
            webhook(
                statuses=[
                    {
                        "id": "wamid.reconciled." + uncertain_id,
                        "recipient_id": "5585999990000",
                        "status": "delivered",
                        "timestamp": str(int(utcnow().timestamp())),
                        "biz_opaque_callback_data": uncertain_id,
                    }
                ]
            ).status_code
            == 200
        )
        assert await process_event()
        rows = client.get(base + "/messages", headers=nh).json()["items"]
        assert next(row for row in rows if row["id"] == uncertain_id)["status"] == "delivered"
        # Queued messages are revalidated after the assignment ends.
        queued_id = str(uuid4())
        assert (
            client.post(
                base + "/messages",
                headers=nh,
                json={"id": queued_id, "text": "Não enviar após encerrar"},
            ).status_code
            == 201
        )
        async with AsyncSessionLocal() as db, db.begin():
            link = await db.get(CareAssignmentModel, assignment.id)
            link.ended_at = utcnow()
        assert await deliver_one()
        assert len(dispatched) == 1
        assert client.post(
            base + "/messages", headers=nh, json={"id": str(uuid4()), "text": "Bloqueado"}
        ).status_code in (403, 409)
        assert client.get(base + "/messages", headers=nh).status_code == 200
        async with AsyncSessionLocal() as db:
            queued = await db.get(WhatsAppMessage, UUID(queued_id))
            assert queued.status == "failed" and queued.error_code == "dispatch_not_allowed"
            assert (
                await db.scalar(
                    select(func.count())
                    .select_from(WhatsAppMessage)
                    .where(WhatsAppMessage.external_id == inbound["id"])
                )
                == 1
            )
            assert (
                await db.scalar(
                    select(func.count())
                    .select_from(WhatsAppEvent)
                    .where(
                        WhatsAppEvent.connection_id == connection.id,
                        WhatsAppEvent.payload.is_not(None),
                    )
                )
                == 0
            )

            assert (await db.get(WhatsAppMessage, other_message.id)).status == "queued"
            assert (await db.get(WhatsAppEvent, other_event.id)).processed_at is None
