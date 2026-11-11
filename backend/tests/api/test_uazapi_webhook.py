import asyncio
import base64
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select

from app.care.outbox import cipher
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.main import app
from app.uazapi.models import UazapiConnection, UazapiConversation, UazapiMessage, UazapiSender
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


@pytest.fixture
async def instances(monkeypatch):
    monkeypatch.setattr(get_settings(), "outbox_encryption_key", Fernet.generate_key().decode())
    result = []
    async with AsyncSessionLocal() as db, db.begin():
        for status in (UserStatus.ACTIVE, UserStatus.ACTIVE, UserStatus.BLOCKED):
            token = uuid4().hex
            user = UserModel(
                name="Nutricionista de teste",
                email=f"{uuid4()}@example.com",
                password_hash="unused",
                role=UserRole.NUTRITIONIST,
                status=status,
            )
            db.add(user)
            await db.flush()
            row = UazapiConnection(
                user_id=user.id,
                instance_id=uuid4().hex,
                base_url="https://example.invalid",
                encrypted_token=cipher().encrypt(token.encode()).decode(),
            )
            db.add(row)
            await db.flush()
            result.append((row.id, token))
    return result


def url(connection_id):
    return f"/api/v1/whatsapp/uazapi/webhook/{connection_id}"


def payload(token, **message):
    return {
        "EventType": "messages",
        "token": token,
        "owner": "synthetic-owner",
        "instanceName": "synthetic-name",
        "BaseUrl": "https://example.invalid",
        "message": {
            "id": "synthetic-owner:message",
            "messageid": "message",
            "chatid": "100@s.whatsapp.net",
            "sender": "100@s.whatsapp.net",
            "senderName": "Contato de teste",
            "fromMe": False,
            "messageType": "Conversation",
            "messageTimestamp": 1788868800123,
            "text": "Mensagem de teste",
            **message,
        },
    }


async def rows(model, connection_id):
    async with AsyncSessionLocal() as db:
        return (await db.scalars(select(model).where(model.connection_id == connection_id))).all()


async def test_webhook_authenticates_and_validates_without_echoing_credentials(instances):
    (first, token), (_, other_token), (blocked, blocked_token) = instances
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for destination, invalid in [
            (first, other_token),
            (uuid4(), token),
            (blocked, blocked_token),
        ]:
            response = await client.post(url(destination), json=payload(invalid))
            assert response.status_code == 401
            assert invalid not in response.text

        for body in (
            payload(token, fromMe="false"),
            payload(token, text="bad\x00text"),
            {"token": []},
        ):
            response = await client.post(url(first), json=body)
            assert response.status_code == 400
            assert token not in response.text
        assert (await client.post(url(first), content=b"bad")).status_code == 415
        oversized = payload(token, text="x" * 1_048_576)
        assert (await client.post(url(first), json=oversized)).status_code == 413

        outgoing = payload(token, fromMe=True)
        unrelated = {"EventType": "messages_update", "token": token}
        for body in (outgoing, unrelated):
            response = await client.post(url(first), json=body)
            assert response.status_code == 204
    for model in (UazapiMessage, UazapiConversation, UazapiSender):
        assert await rows(model, first) == []


async def test_webhook_deduplicates_concurrent_delivery_and_isolates_instances(instances):
    (first, token), (second, other_token), _ = instances
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        responses = await asyncio.gather(
            *(client.post(url(first), json=payload(token)) for _ in range(6)),
            client.post(url(second), json=payload(other_token)),
        )
        assert all(response.status_code == 204 and not response.content for response in responses)
        replay = payload(token, chatid="999@lid", sender="999@lid", text="Repetida")
        assert (await client.post(url(first), json=replay)).status_code == 204
        media = payload(token, messageid="media", messageType="ImageMessage", text=None)
        assert (await client.post(url(first), json=media)).status_code == 204

    for connection, count in ((first, 2), (second, 1)):
        (chat,) = await rows(UazapiConversation, connection)
        (sender,) = await rows(UazapiSender, connection)
        messages = await rows(UazapiMessage, connection)
        assert len(messages) == count
        assert chat.external_id == sender.external_id == "100@s.whatsapp.net"
        assert sender.display_name == "Contato de teste"
        assert all(
            row.conversation_id == chat.id and row.sender_id == sender.id for row in messages
        )
        message = next(row for row in messages if row.external_id == "message")
        assert message.direction == "inbound"
        assert message.text == "Mensagem de teste"
        assert message.occurred_at == datetime.fromtimestamp(1788868800.123, UTC)
        if connection == first:
            media = next(row for row in messages if row.external_id == "media")
            assert media.kind == "ImageMessage"
            assert media.text is None


async def test_uazapi_history_and_send_are_scoped_and_idempotent(instances, monkeypatch):
    from app.uazapi import messaging

    (first, token), (second, other_token), _ = instances
    calls = []
    started = asyncio.Event()
    release = asyncio.Event()

    async def simulated_provider(func, settings, number, text, tracking):
        calls.append((settings.uazapi_instance_token.get_secret_value(), number, text, tracking))
        started.set()
        await release.wait()
        return {"messageid": "provider-outbound", "status": "Sent"}

    monkeypatch.setattr(messaging, "run_in_threadpool", simulated_provider)

    from app.users.infrastructure.repository import SQLAlchemyUserRepository
    from app.users.presentation.dependencies import get_current_user

    async def actor_for(connection_id):
        async with AsyncSessionLocal() as db:
            row = await db.get(UazapiConnection, connection_id)
            return await SQLAlchemyUserRepository(db).find_by_id(row.user_id)

    actor, other = await actor_for(first), await actor_for(second)
    app.dependency_overrides[get_current_user] = lambda: actor
    path = "/api/v1/whatsapp/uazapi/conversations"
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.post(url(first), json=payload(token))).status_code == 204
            assert (await client.post(url(second), json=payload(other_token))).status_code == 204
            assert (
                await client.post(
                    url(first),
                    json=payload(token, messageid="newer", messageTimestamp=1788868801123),
                )
            ).status_code == 204
            (chat,) = (await client.get(path)).json()
            history_path = f"{path}/{chat['id']}/messages"
            page = (await client.get(history_path, params={"limit": 1})).json()
            assert page["next_before"] == page["items"][0]["id"]
            older = (await client.get(history_path, params={"before": page["next_before"]})).json()
            assert len(older["items"]) == 1 and older["next_before"] is None

            app.dependency_overrides[get_current_user] = lambda: other
            (other_chat,) = (await client.get(path)).json()
            assert other_chat["id"] != chat["id"]
            assert (await client.get(history_path)).status_code == 404
            body = {"request_id": str(uuid4()), "text": "Resposta de teste"}
            assert (await client.post(history_path, json=body)).status_code == 404
            assert not calls
            app.dependency_overrides[get_current_user] = lambda: actor

            original = asyncio.create_task(client.post(history_path, json=body))
            try:
                await asyncio.wait_for(started.wait(), timeout=3)
                retry = await asyncio.wait_for(client.post(history_path, json=body), timeout=3)
                assert retry.json()["delivery_status"] == "sending"
                assert (
                    await client.post(history_path, json=body | {"text": "Outro"})
                ).status_code == 409
                early_receipt = {
                    "EventType": "messages_update",
                    "token": token,
                    "state": "Delivered",
                    "event": {"MessageIDs": ["provider-outbound"], "IsFromMe": True},
                }
                assert (await client.post(url(first), json=early_receipt)).status_code == 204
            finally:
                release.set()
                response = await original
            saved = response.json()
            assert saved["id"] == retry.json()["id"]
            assert saved["delivery_status"] == "delivered"
            assert calls == [(token, "100@s.whatsapp.net", body["text"], saved["id"])]

            for state in ("Read", "Delivered"):
                receipt = {
                    "EventType": "messages_update",
                    "token": token,
                    "state": state,
                    "event": {"MessageIDs": ["provider-outbound"], "IsFromMe": True},
                }
                assert (await client.post(url(first), json=receipt)).status_code == 204
            assert (await client.post(history_path, json=body)).json()["delivery_status"] == "read"
            assert len(calls) == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_ambiguous_send_is_not_repeated_and_echo_confirms_it(instances, monkeypatch):
    from app.uazapi import messaging
    from app.uazapi.client import UazapiError
    from app.users.infrastructure.repository import SQLAlchemyUserRepository
    from app.users.presentation.dependencies import get_current_user

    (connection, token), *_ = instances
    async with AsyncSessionLocal() as db:
        row = await db.get(UazapiConnection, connection)
        actor = await SQLAlchemyUserRepository(db).find_by_id(row.user_id)

    calls = []

    def timeout(settings, number, text, tracking):
        calls.append(tracking)
        raise UazapiError("timeout")

    monkeypatch.setattr(messaging, "send_text", timeout)
    app.dependency_overrides[get_current_user] = lambda: actor
    path = "/api/v1/whatsapp/uazapi/conversations"
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.post(url(connection), json=payload(token))).status_code == 204
            (chat,) = (await client.get(path)).json()
            history_path = f"{path}/{chat['id']}/messages"
            body = {"request_id": str(uuid4()), "text": "Teste de falha"}
            first = (await client.post(history_path, json=body)).json()
            second = (await client.post(history_path, json=body)).json()
            assert first == second and first["delivery_status"] == "unknown"
            assert calls == [first["id"]]

            echo = payload(
                token,
                fromMe=True,
                track_source="mais-saude",
                track_id=first["id"],
                messageid="confirmed",
                status="Sent",
            )
            assert (await client.post(url(connection), json=echo)).status_code == 204
            assert (await client.post(history_path, json=body)).json()["delivery_status"] == "sent"
            assert calls == [first["id"]]
            monkeypatch.setattr(
                messaging, "send_text", lambda *args: {"messageid": "queued", "status": "Queued"}
            )
            queued = await client.post(history_path, json=body | {"request_id": str(uuid4())})
            assert queued.json()["delivery_status"] == "unknown"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_provision_recovers_after_timeout_and_reuses_link(monkeypatch):
    from pydantic import HttpUrl, SecretStr

    from app.uazapi.client import UazapiError
    from app.uazapi.provisioning import ensure_connection

    settings = get_settings()
    monkeypatch.setattr(settings, "outbox_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "uazapi_base_url", HttpUrl("https://provider.example.com"))
    monkeypatch.setattr(settings, "uazapi_admin_token", SecretStr("test-admin"))
    monkeypatch.setattr(settings, "uazapi_webhook_base_url", HttpUrl("https://app.example.com"))
    calls = []
    hooks = []

    def provider(config, name, *, create):
        calls.append((name, create))
        if create:
            raise UazapiError("timeout")
        return "recovered-instance", SecretStr("test-instance")

    def webhook(config, url):
        assert config.uazapi_instance_token.get_secret_value() == "test-instance"
        hooks.append(url)

    monkeypatch.setattr("app.uazapi.provisioning.provision_instance", provider)
    monkeypatch.setattr("app.uazapi.provisioning.configure_instance_webhook", webhook)
    user = UserModel(
        name="Nutricionista de teste",
        email=f"{uuid4()}@example.com",
        password_hash="unused",
        role=UserRole.NUTRITIONIST,
        status=UserStatus.ACTIVE,
    )
    async with AsyncSessionLocal() as db, db.begin():
        db.add(user)
    async with AsyncSessionLocal() as db:
        with pytest.raises(UazapiError, match="timeout"):
            await ensure_connection(db, user.id, settings)
    async with AsyncSessionLocal() as db:
        row = await ensure_connection(db, user.id, settings)
        assert row.instance_id == "recovered-instance"
        assert cipher().decrypt(row.encrypted_token.encode()) == b"test-instance"
        assert (await ensure_connection(db, user.id, settings)).id == row.id

    name = f"mais-saude-{user.id}"
    assert calls == [(name, True), (name, False)]
    assert hooks == [f"https://app.example.com/api/v1/whatsapp/uazapi/webhook/{row.id}"]

    # An expired reservation can also predate any call to the provider.
    async with AsyncSessionLocal() as db, db.begin():
        row = await db.get(UazapiConnection, row.id)
        row.instance_id = f"pending:{name}"
        row.encrypted_token = None
        row.updated_at = datetime.now(UTC) - timedelta(minutes=6)

    calls.clear()

    def missing_then_create(config, name, *, create):
        calls.append((name, create))
        if not create:
            raise UazapiError("provision_missing")
        return "new-instance", SecretStr("test-instance")

    monkeypatch.setattr("app.uazapi.provisioning.provision_instance", missing_then_create)
    async with AsyncSessionLocal() as db:
        recovered = await ensure_connection(db, user.id, settings)
        assert recovered.instance_id == "new-instance"
    assert calls == [(name, False), (name, True)]


async def test_media_download_is_scoped_to_the_linked_conversation(instances, monkeypatch):
    from app.users.infrastructure.repository import SQLAlchemyUserRepository
    from app.users.presentation.dependencies import get_current_user

    (first, token), (second, _), _ = instances
    calls = []

    def download(settings, message_id):
        calls.append(message_id)
        assert settings.uazapi_instance_token.get_secret_value() == token
        return {"mime_type": "image/png", "base64": "iVBORw0KGgo="}

    monkeypatch.setattr("app.uazapi.messaging.download_media", download)

    async def actor_for(connection_id):
        async with AsyncSessionLocal() as db:
            connection = await db.get(UazapiConnection, connection_id)
            return await SQLAlchemyUserRepository(db).find_by_id(connection.user_id)

    actor = await actor_for(first)
    app.dependency_overrides[get_current_user] = lambda: actor
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            event = payload(token, messageType="ImageMessage", text=None)
            assert (await client.post(url(first), json=event)).status_code == 204
            (message,) = await rows(UazapiMessage, first)
            path = (
                f"/api/v1/whatsapp/uazapi/conversations/{message.conversation_id}"
                f"/messages/{message.id}/media"
            )
            result = await client.get(path)
            assert result.json()["mime_type"] == "image/png"
            assert result.headers["Cache-Control"] == "no-store"
            actor = await actor_for(second)
            assert (await client.get(path)).status_code == 404
            assert calls == [message.external_id]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_register_patient_from_direct_whatsapp_chat(instances, make_cpf):
    from app.care.models import CareAssignmentModel
    from app.users.infrastructure.repository import SQLAlchemyUserRepository
    from app.users.presentation.dependencies import get_current_user

    (first, token), (second, _), _ = instances

    async def actor_for(connection_id):
        async with AsyncSessionLocal() as db:
            connection = await db.get(UazapiConnection, connection_id)
            return await SQLAlchemyUserRepository(db).find_by_id(connection.user_id)

    owner = await actor_for(first)
    actor = owner
    app.dependency_overrides[get_current_user] = lambda: actor
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            jid = "5585999999999@s.whatsapp.net"
            event = payload(token, chatid=jid, sender="123456789012345@lid")
            assert (await client.post(url(first), json=event)).status_code == 204
            (chat,) = await rows(UazapiConversation, first)
            path = f"/api/v1/whatsapp/uazapi/conversations/{chat.id}"
            before = (await client.get(f"{path}/messages")).json()
            assert before["phone"] == "+5585999999999"
            assert before["patient_id"] is None

            body = {
                "name": "Paciente WhatsApp",
                "email": f"{uuid4()}@example.com",
                "cpf": make_cpf(),
            }
            actor = await actor_for(second)
            assert (await client.post(f"{path}/patient", json=body)).status_code == 404
            actor = owner
            created = await client.post(f"{path}/patient", json=body)
            assert created.status_code == 200, created.text
            assert (await client.post(f"{path}/patient", json=body)).json() == created.json()
            patient_id = created.json()["patient_id"]
            assert (await client.get(f"{path}/messages")).json()["patient_id"] == patient_id

        async with AsyncSessionLocal() as db:
            patient = await db.scalar(select(UserModel).where(UserModel.email == body["email"]))
            assert str(patient.id) == patient_id and patient.role == UserRole.PATIENT
            assignment = await db.scalar(
                select(CareAssignmentModel).where(CareAssignmentModel.patient_id == patient.id)
            )
            assert assignment.nutritionist_id == owner.id
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize(
    ("mime", "kind", "provider_type", "content"),
    [
        ("image/png", "ImageMessage", "image", "iVBORw0KGgo="),
        ("audio/mpeg", "AudioMessage", "audio", "SUQz"),
        ("application/pdf", "DocumentMessage", "document", "JVBERi0xLjQ="),
        (
            "application/pdf",
            "DocumentMessage",
            "document",
            base64.b64encode(b"%PDF-" + b"x" * (10 * 1024 * 1024 - 5)).decode(),
        ),
    ],
)
async def test_send_attachment_preserves_idempotency(
    instances, monkeypatch, mime, kind, provider_type, content
):
    from app.users.infrastructure.repository import SQLAlchemyUserRepository
    from app.users.presentation.dependencies import get_current_user

    (connection_id, token), *_ = instances
    async with AsyncSessionLocal() as db:
        connection = await db.get(UazapiConnection, connection_id)
        actor = await SQLAlchemyUserRepository(db).find_by_id(connection.user_id)

    calls = []

    def send(settings, destination, media_type, mime_type, encoded, filename, text, tracking):
        assert settings.uazapi_instance_token.get_secret_value() == token
        calls.append((destination, media_type, mime_type, encoded, filename, tracking))
        return {"messageid": "outbound-media", "status": "Sent"}

    monkeypatch.setattr("app.uazapi.messaging.send_media", send)
    app.dependency_overrides[get_current_user] = lambda: actor
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.post(url(connection_id), json=payload(token))).status_code == 204
            (chat,) = await rows(UazapiConversation, connection_id)
            path = f"/api/v1/whatsapp/uazapi/conversations/{chat.id}/messages"
            body = {
                "request_id": str(uuid4()),
                "attachment": {"name": "arquivo", "mime_type": mime, "base64": content},
            }
            result = await client.post(path, json=body)
            assert result.status_code == 200, result.text
            item = result.json()
            assert item["kind"] == kind and item["media_available"]
            assert (await client.post(path, json=body)).json() == item
            changed = body | {"attachment": body["attachment"] | {"name": "outro"}}
            assert (await client.post(path, json=changed)).status_code == 409
            assert calls == [
                ("100@s.whatsapp.net", provider_type, mime, content, "arquivo", item["id"])
            ]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_send_body_stops_reading_oversized_stream():
    from starlette.requests import Request

    from app.uazapi.messaging import MAX_UPLOAD_BASE64, read_send_body

    parts = iter(
        [
            {"type": "http.request", "body": b"x" * MAX_UPLOAD_BASE64, "more_body": True},
            {"type": "http.request", "body": b"x" * (65 * 1024), "more_body": True},
        ]
    )

    async def receive():
        return next(parts)

    with pytest.raises(HTTPException) as error:
        await read_send_body(Request({"type": "http"}, receive))
    assert error.value.status_code == 413


async def test_recovery_reuses_webhook_identity_and_creates_missing_chat(instances, monkeypatch):
    (connection_id, token), (other_connection, _), _ = instances
    from app.uazapi.router import owned_connection

    async def owner_connection():
        async with AsyncSessionLocal() as db:
            return await db.get(UazapiConnection, connection_id)

    original = payload(token)["message"]
    missing = payload(token, messageid="missing", chatid="200@s.whatsapp.net")["message"]
    outbound = payload(token, messageid="outbound", fromMe=True)["message"]

    def find_messages(settings, offset):
        assert settings.uazapi_instance_token.get_secret_value() == token
        return ([original, missing], 2) if offset == 0 else ([outbound, {}], None)

    monkeypatch.setitem(app.dependency_overrides, owned_connection, owner_connection)
    monkeypatch.setattr("app.uazapi.webhook.find_messages", find_messages)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        assert (await client.post(url(connection_id), json=payload(token))).status_code == 204
        for _ in range(2):
            first = await client.post("/api/v1/whatsapp/uazapi/recover")
            assert first.json() == {"next_offset": 2, "skipped": 0}
            last = await client.post("/api/v1/whatsapp/uazapi/recover?offset=2")
            assert last.json() == {"next_offset": None, "skipped": 1}

    messages = await rows(UazapiMessage, connection_id)
    assert {message.external_id: message.direction for message in messages} == {
        "message": "inbound",
        "missing": "inbound",
        "outbound": "outbound",
    }
    assert len(await rows(UazapiConversation, connection_id)) == 2
    assert not await rows(UazapiMessage, other_connection)


async def test_start_conversation_requires_owned_assignment_and_reuses_chat(instances, monkeypatch):
    from app.care.models import CareAssignmentModel
    from app.uazapi.router import owned_connection

    (connection_id, _), (other_connection, _), _ = instances
    async with AsyncSessionLocal() as db, db.begin():
        owner = await db.get(UazapiConnection, connection_id)
        other = await db.get(UazapiConnection, other_connection)
        patients = []
        for nutritionist in (owner, other, owner):
            patient = UserModel(
                name="Paciente de teste",
                email=f"{uuid4()}@example.com",
                password_hash="unused",
                role=UserRole.PATIENT,
                status=UserStatus.ACTIVE,
            )
            db.add(patient)
            await db.flush()
            db.add(
                CareAssignmentModel(
                    patient_id=patient.id,
                    nutritionist_id=nutritionist.user_id,
                    actor_id=nutritionist.user_id,
                )
            )
            patients.append(patient.id)

    async def owner_connection():
        return owner

    monkeypatch.setitem(app.dependency_overrides, owned_connection, owner_connection)
    path = "/api/v1/whatsapp/uazapi/conversations"
    body = {"patient_id": str(patients[0]), "phone": "5585999999999"}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        assert (
            await client.post(path, json={**body, "patient_id": str(patients[1])})
        ).status_code == 404
        first = await client.post(path, json=body)
        retry = await client.post(path, json=body)
        assert first.status_code == retry.status_code == 200
        assert first.json() == retry.json()
        assert (
            await client.post(path, json={**body, "patient_id": str(patients[2])})
        ).status_code == 409
        history = await client.get(f"{path}/{first.json()['id']}/messages")
        assert history.json()["patient_id"] == str(patients[0])
        assert history.json()["items"] == []
