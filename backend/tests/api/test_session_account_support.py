import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient

from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)
PASSWORD = "ValidationOnly123!"
ORIGIN = {"Origin": "http://localhost:5173"}


async def users(*roles):
    hashed = PasswordHasher().hash(PASSWORD)
    rows = [
        UserModel(
            id=uuid7(),
            name="Pessoa Teste",
            email=f"account-{uuid7()}@example.com",
            password_hash=hashed,
            role=role,
            status=UserStatus.ACTIVE,
        )
        for role in roles
    ]
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(rows)
    return rows


def login(client, user, **kwargs):
    result = client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}, **kwargs
    )
    assert result.status_code == 200, result.text
    return result


def headers(client, user):
    return {"Authorization": "Bearer " + login(client, user).json()["access_token"]}


async def test_cookie_origin_restore_logout_and_replay():
    (user,) = await users(UserRole.PATIENT)
    with TestClient(app) as client:
        result = login(client, user, headers=ORIGIN)
        assert result.json()["refresh_token"] is None
        assert "HttpOnly" in result.headers["set-cookie"]
        assert "SameSite=lax" in result.headers["set-cookie"]
        access = {"Authorization": "Bearer " + result.json()["access_token"]}
        assert client.post("/api/v1/auth/refresh").status_code == 403
        assert (
            client.post(
                "/api/v1/auth/refresh", headers={"Origin": "https://evil.example"}
            ).status_code
            == 403
        )
        restored = client.post("/api/v1/auth/refresh", headers=ORIGIN)
        assert restored.status_code == 200
        assert client.post("/api/v1/auth/logout", headers=ORIGIN).status_code == 204
        assert client.get("/api/v1/users/me", headers=access).status_code == 401
        first = login(client, user).json()
        rotated = client.post(
            "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
        ).json()
        assert (
            client.post(
                "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/api/v1/auth/refresh", json={"refresh_token": rotated["refresh_token"]}
            ).status_code
            == 401
        )
        assert (
            client.get(
                "/api/v1/users/me", headers={"Authorization": "Bearer " + rotated["access_token"]}
            ).status_code
            == 401
        )


async def test_concurrent_refresh_revokes_replayed_family():
    (user,) = await users(UserRole.PATIENT)
    with TestClient(app) as client:
        tokens = login(client, user).json()
        with ThreadPoolExecutor(2) as pool:
            replies = list(
                pool.map(
                    lambda _: client.post(
                        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
                    ),
                    range(2),
                )
            )
        assert sorted(reply.status_code for reply in replies) == [200, 401]
        winner = next(reply.json() for reply in replies if reply.status_code == 200)
        assert (
            client.get(
                "/api/v1/users/me", headers={"Authorization": "Bearer " + winner["access_token"]}
            ).status_code
            == 401
        )


async def test_professional_profile_persists_and_rejects_conflict():
    nutri, patient = await users(UserRole.NUTRITIONIST, UserRole.PATIENT)
    with TestClient(app) as client:
        auth = headers(client, nutri)
        endpoint = "/api/v1/account/professional-profile"
        profile = client.get(endpoint, headers=auth).json()
        data = {**profile, "crn": "CRN Teste", "bio": "Perfil de teste"}
        assert client.put(endpoint, headers=auth, json=data).status_code == 200
        assert client.put(endpoint, headers=auth, json=data).status_code == 409
        assert client.get(endpoint, headers=auth).json()["crn"] == "CRN Teste"
        assert client.get(endpoint, headers=headers(client, patient)).status_code == 403


async def test_settings_reauthenticate_persist_and_password_revokes():
    (user,) = await users(UserRole.ADMIN)
    with TestClient(app) as client:
        auth = headers(client, user)
        endpoint = "/api/v1/account/settings"
        original = client.get(endpoint, headers=auth).json()
        assert (
            client.put(
                endpoint, headers=auth, json={**original, "current_password": "wrong"}
            ).status_code
            == 403
        )
        updated = {
            **original,
            "name": "Nome Atualizado",
            "email_notifications": False,
            "current_password": PASSWORD,
        }
        assert client.put(endpoint, headers=auth, json=updated).status_code == 200
        assert client.get(endpoint, headers=auth).json()["email_notifications"] is False
        assert client.get("/api/v1/users/me", headers=auth).json()["name"] == "Nome Atualizado"
        assert (
            client.post(
                "/api/v1/users/me/password",
                headers=auth,
                json={
                    "current_password": PASSWORD,
                    "new_password": "NewPassword123!",
                    "new_password_confirmation": "NewPassword123!",
                },
            ).status_code
            == 200
        )
        assert client.get("/api/v1/users/me", headers=auth).status_code == 401


async def test_email_change_requires_password_and_revokes_session():
    (user,) = await users(UserRole.ADMIN)
    with TestClient(app) as client:
        auth = headers(client, user)
        email = f"changed-{uuid7()}@example.com"
        assert (
            client.patch(
                f"/api/v1/users/{user.id}", headers=auth, json={"email": email}
            ).status_code
            == 403
        )
        data = client.get("/api/v1/account/settings", headers=auth).json()
        assert (
            client.put(
                "/api/v1/account/settings",
                headers=auth,
                json={**data, "email": email, "current_password": PASSWORD},
            ).status_code
            == 200
        )
        assert client.get("/api/v1/users/me", headers=auth).status_code == 401


async def test_support_participants_dedup_read_and_pagination():
    admin, other_admin, nutri, patient = await users(
        UserRole.ADMIN, UserRole.ADMIN, UserRole.NUTRITIONIST, UserRole.PATIENT
    )
    with TestClient(app) as client:
        a, other, n, p = [headers(client, user) for user in (admin, other_admin, nutri, patient)]
        base = f"/api/v1/support/{nutri.id}"
        body = {"id": str(uuid7()), "text": "Mensagem sintética"}
        for _ in range(2):
            assert client.post(base + "/messages", headers=a, json=body).status_code == 201
        assert (
            client.post(
                base + "/messages", headers=a, json={**body, "text": "alterada"}
            ).status_code
            == 409
        )
        assert len(client.get(base + "/messages", headers=a).json()["items"]) == 1
        assert client.get(base + "/messages", headers=other).json()["items"] == []
        assert client.get("/api/v1/support/contacts", headers=p).status_code == 403
        nbase = f"/api/v1/support/{admin.id}"
        assert len(client.get(nbase + "/messages", headers=n).json()["items"]) == 1
        assert (
            client.post(nbase + "/read", headers=n, json={"ids": [body["id"]]}).status_code == 204
        )
        assert client.get(base + "/messages", headers=a).json()["items"][0]["read_at"]
        second = {"id": str(uuid7()), "text": "Resposta"}
        assert client.post(nbase + "/messages", headers=n, json=second).status_code == 201
        page = client.get(base + "/messages?limit=1", headers=a).json()
        assert page["items"][0]["id"] == second["id"]
        assert (
            client.get(base + f"/messages?before={page['next_cursor']}", headers=a).json()["items"][
                0
            ]["id"]
            == body["id"]
        )


async def test_readiness_rejects_missing_schema(monkeypatch):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    import app.operations as operations

    engine = create_async_engine(
        os.environ["DATABASE_URL"], connect_args={"options": "-csearch_path=pg_catalog"}
    )
    monkeypatch.setattr(operations, "AsyncSessionLocal", async_sessionmaker(engine))
    with TestClient(app) as client:
        assert client.get("/ready").status_code == 503
        assert client.get("/health").status_code == 200
    await engine.dispose()


async def test_publish_transfer_and_double_publish_are_serialized():
    from datetime import timedelta

    from app.care.plan_router import local_today
    from tests.api.test_meal_plans import plan_content

    admin, first, second, patient = await users(
        UserRole.ADMIN, UserRole.NUTRITIONIST, UserRole.NUTRITIONIST, UserRole.PATIENT
    )
    with TestClient(app) as client:
        a, n, p = headers(client, admin), headers(client, first), headers(client, patient)
        base = f"/api/v1/patients/{patient.id}"
        assert (
            client.put(
                base + "/assignment", headers=a, json={"nutritionist_id": str(first.id)}
            ).status_code
            == 200
        )
        data = plan_content(local_today(), local_today() + timedelta(days=3))
        draft = client.post(base + "/plans", headers=n, json=data).json()

        def publish():
            return client.post(
                base + f"/plans/{draft['id']}/publish", headers=n, json={"expected_revision": 1}
            )

        def transfer():
            return client.put(
                base + "/assignment", headers=a, json={"nutritionist_id": str(second.id)}
            )

        with ThreadPoolExecutor(2) as pool:
            left, right = pool.submit(publish), pool.submit(transfer)
            published, transferred = left.result(), right.result()
        assert (published.status_code == 200) != (transferred.status_code == 200)
        assert published.status_code in (200, 403, 409)
        assert transferred.status_code in (200, 409)
        if transferred.status_code == 200:
            assert client.get(base + "/plans/current", headers=p).json() is None
            assert (
                client.put(
                    base + "/assignment", headers=a, json={"nutritionist_id": str(first.id)}
                ).status_code
                == 200
            )
        draft = client.post(base + "/plans", headers=n, json=data).json()
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: publish(), range(2)))
        assert sorted(result.status_code for result in results) == [200, 409]


async def test_password_reset_outbox_delivery_single_use_and_revocation(monkeypatch):
    import json
    from datetime import UTC, datetime

    from cryptography.fernet import Fernet
    from sqlalchemy import select

    from app.care.email_worker import deliver_one
    from app.care.models import EmailOutboxModel
    from app.config.settings import get_settings
    from app.users.infrastructure.email import SMTPPasswordResetSender
    from app.users.infrastructure.models import PasswordResetTokenModel

    (user,) = await users(UserRole.PATIENT)
    sent = []
    monkeypatch.setattr(
        SMTPPasswordResetSender, "_send", lambda self, message: sent.append(message)
    )
    with TestClient(app) as client:
        auth = headers(client, user)
        response = client.post("/api/v1/auth/password/forgot", json={"email": user.email})
        assert response.status_code == 200
        assert not sent
        async with AsyncSessionLocal() as db, db.begin():
            row = await db.scalar(
                select(EmailOutboxModel)
                .join(
                    PasswordResetTokenModel,
                    PasswordResetTokenModel.id == EmailOutboxModel.password_reset_id,
                )
                .where(PasswordResetTokenModel.user_id == user.id)
            )
            values = json.loads(
                Fernet(get_settings().outbox_encryption_key.encode()).decrypt(row.payload.encode())
            )
            assert values["token"] not in row.payload
            row.available_at = datetime(2000, 1, 1, tzinfo=UTC)
            row_id = row.id
        assert await deliver_one()
        assert len(sent) == 1
        async with AsyncSessionLocal() as db:
            delivered = await db.get(EmailOutboxModel, row_id)
            assert delivered.payload is None and delivered.delivered_at
        body = {
            "token": values["token"],
            "new_password": "ResetPassword123!",
            "new_password_confirmation": "ResetPassword123!",
        }
        assert client.post("/api/v1/auth/password/reset", json=body).status_code == 200
        assert client.post("/api/v1/auth/password/reset", json=body).status_code == 422
        assert client.get("/api/v1/users/me", headers=auth).status_code == 401
