import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import HttpUrl, SecretStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.cli.link_uazapi import link
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.uazapi.client import ConnectionStatus
from app.uazapi.models import (
    UazapiAttachment,
    UazapiConnection,
    UazapiConversation,
    UazapiMessage,
    UazapiSender,
)
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


async def test_link_and_storage_isolate_nutritionists(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "outbox_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "uazapi_base_url", HttpUrl("https://example.com"))
    password = "SyntheticPreview123!"
    password_hash = PasswordHasher().hash(password)
    owners = [
        UserModel(
            name=f"Profissional teste {letter}",
            email=f"uazapi-{uuid4()}@example.com",
            password_hash=password_hash,
            role=UserRole.NUTRITIONIST,
            status=UserStatus.ACTIVE,
        )
        for letter in ("A", "B")
    ]
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(owners)
    monkeypatch.setattr(
        "app.cli.link_uazapi.instance_identity",
        lambda cfg: cfg.uazapi_instance_token.get_secret_value().split(":")[0],
    )
    first, second = owners
    token_a, token_b = f"{uuid4()}:test-a", f"{uuid4()}:test-b"
    await link(first.id, SecretStr(token_a))
    with pytest.raises(SystemExit, match="já tem vínculo"):
        await link(second.id, SecretStr(token_a))
    await link(second.id, SecretStr(token_b))

    async with AsyncSessionLocal() as db, db.begin():
        a, b = [
            await db.scalar(select(UazapiConnection).where(UazapiConnection.user_id == user.id))
            for user in owners
        ]
        assert a.encrypted_token != token_a
        assert b.encrypted_token != token_b
        jid = "5585999999999@s.whatsapp.net"
        conversation = UazapiConversation(connection_id=a.id, external_id=jid)
        sender = UazapiSender(connection_id=a.id, external_id=jid)
        other_sender = UazapiSender(connection_id=b.id, external_id=jid)
        db.add_all([conversation, sender, other_sender])
        await db.flush()
        fields = {
            "connection_id": a.id,
            "conversation_id": conversation.id,
            "direction": "inbound",
            "kind": "image",
            "occurred_at": datetime.now(UTC),
        }
        message = UazapiMessage(**fields, sender_id=sender.id, external_id="image-1")
        db.add(message)
        await db.flush()
        db.add(UazapiAttachment(message_id=message.id, kind="image", mime_type="image/png"))
        await db.flush()
        assert message.text is None and sender.assignment_id is None
        for sender_id, external_id in [(other_sender.id, "image-2"), (sender.id, "image-1")]:
            with pytest.raises(IntegrityError):
                async with db.begin_nested():
                    db.add(UazapiMessage(**fields, sender_id=sender_id, external_id=external_id))
                    await db.flush()

    observed = []

    def status(cfg):
        observed.append(cfg.uazapi_instance_token.get_secret_value())
        return ConnectionStatus(connected=True, logged_in=True)

    monkeypatch.setattr("app.uazapi.router.connection_status", status)
    with TestClient(app) as client:
        route = "/api/v1/whatsapp/uazapi/connection"
        assert client.get(route).status_code == 401
        for user in owners:
            login = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            assert login.status_code == 200
            response = client.get(
                route, headers={"Authorization": f"Bearer {login.json()['access_token']}"}
            )
            assert response.status_code == 200
            assert response.json() == {"connected": True, "logged_in": True}
    assert observed == [token_a, token_b]
