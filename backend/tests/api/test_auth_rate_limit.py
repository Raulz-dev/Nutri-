import asyncio
import os
import subprocess
import sys
from datetime import timedelta
from ipaddress import IPv6Address
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError

from app.care.policies import utcnow
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security import rate_limit
from app.security.password import PasswordHasher
from app.security.rate_limit import AuthAttemptModel, bucket_key, reserve_attempt
from app.users.domain.enums import UserRole
from app.users.infrastructure.models import UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)
PASSWORD = "SyntheticRateOnly123!"


def ip():
    return str(IPv6Address((int("20010db8", 16) << 96) | (uuid7().int & ((1 << 96) - 1))))


@pytest.fixture
def limits(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "auth_rate_limit", 30)
    monkeypatch.setattr(settings, "auth_account_rate_limit", 2)
    monkeypatch.setattr(settings, "auth_account_window_seconds", 60)
    return settings


def failed_login(client, email):
    return client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})


async def create_user():
    user = UserModel(
        name="Pessoa Sintética",
        email=f"rate-{uuid7()}@example.com",
        password_hash=PasswordHasher().hash(PASSWORD),
        role=UserRole.PATIENT,
    )
    async with AsyncSessionLocal() as db, db.begin():
        db.add(user)
    return user


async def test_ip_limit_ignores_untrusted_forwarded_header_and_preserves_cors(limits):
    limits.auth_rate_limit = 1
    with TestClient(app, client=(ip(), 123)) as client:
        assert failed_login(client, f"one-{uuid7()}@example.com").status_code == 401
        response = client.post(
            "/api/v1/auth/login",
            headers={"Origin": "http://localhost:5173", "X-Forwarded-For": ip()},
            json={"email": f"two-{uuid7()}@example.com", "password": "wrong"},
        )
        assert response.status_code == 429
        assert 1 <= int(response.headers["retry-after"]) <= 60
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "Retry-After" in response.headers["access-control-expose-headers"]
        assert response.json()["error"]["request_id"] == response.headers["x-request-id"]
        assert client.get("/health").status_code == 200


async def test_account_limit_follows_normalized_email_across_ips_and_root_path(limits):
    limits.auth_account_rate_limit = 3
    email = f"account-{uuid7()}@example.com"
    for value in [email, email.upper(), f"Pessoa <{email}>"]:
        with TestClient(app, client=(ip(), 123)) as client:
            assert failed_login(client, value).status_code == 401
    with TestClient(app, client=(ip(), 123), root_path="/deployment") as client:
        assert failed_login(client, email).status_code == 429
        assert (
            client.post(
                "/deployment/api/v1/auth/login",
                json={"email": email, "password": "wrong-password"},
            ).status_code
            == 429
        )
        assert failed_login(client, f"different-{uuid7()}@example.com").status_code == 401
    async with AsyncSessionLocal() as db:
        row = await db.get(AuthAttemptModel, bucket_key("account:login", email))
        assert row.attempts == 3


async def test_window_expires_and_blocked_attempt_does_not_extend_it(limits):
    email = f"expire-{uuid7()}@example.com"
    with TestClient(app, client=(ip(), 123)) as client:
        assert failed_login(client, email).status_code == 401
        assert failed_login(client, email).status_code == 401
        async with AsyncSessionLocal() as db:
            original_expiry = (
                await db.get(AuthAttemptModel, bucket_key("account:login", email))
            ).expires_at
        assert failed_login(client, email).status_code == 429
        async with AsyncSessionLocal() as db, db.begin():
            row = await db.get(AuthAttemptModel, bucket_key("account:login", email))
            assert row.expires_at == original_expiry
            row.expires_at = utcnow() - timedelta(seconds=1)
        assert failed_login(client, email).status_code == 401
        async with AsyncSessionLocal() as db:
            assert (
                await db.get(AuthAttemptModel, bucket_key("account:login", email))
            ).attempts == 1


async def test_successful_logins_do_not_accumulate_or_erase_failed_attempts(limits):
    user = await create_user()
    with TestClient(app, client=(ip(), 123)) as client:
        for _ in range(4):
            assert (
                client.post(
                    "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
                ).status_code
                == 200
            )
        assert failed_login(client, user.email).status_code == 401
        assert (
            client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
            ).status_code
            == 200
        )
        async with AsyncSessionLocal() as db:
            assert (
                await db.get(AuthAttemptModel, bucket_key("account:login", user.email))
            ).attempts == 1
        assert failed_login(client, user.email).status_code == 401
        assert (
            client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
            ).status_code
            == 429
        )


async def test_recovery_has_same_limit_for_existing_and_unknown_accounts(limits):
    user = await create_user()
    for email in [user.email, f"unknown-{uuid7()}@example.com"]:
        bodies = []
        for _ in range(2):
            with TestClient(app, client=(ip(), 123)) as client:
                response = client.post("/api/v1/auth/password/forgot", json={"email": email})
                assert response.status_code == 200
                bodies.append(response.json())
        assert bodies[0] == bodies[1]
        with TestClient(app, client=(ip(), 123)) as client:
            assert (
                client.post("/api/v1/auth/password/forgot", json={"email": email}).status_code
                == 429
            )
            assert failed_login(client, email).status_code == 401


async def test_registration_limit_normalizes_cpf_across_different_emails(limits, make_cpf):
    cpf = make_cpf()
    for index, expected in enumerate([201, 409, 429]):
        value = cpf if index != 1 else f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
        with TestClient(app, client=(ip(), 123)) as client:
            response = client.post(
                "/api/v1/users",
                json={
                    "name": "Paciente Sintético",
                    "email": f"register-{uuid7()}@example.com",
                    "password": PASSWORD,
                    "role": "patient",
                    "cpf": value,
                },
            )
            assert response.status_code == expected, response.text


async def test_reauthentication_is_shared_between_routes_and_logout_remains_available(
    limits, make_cpf
):
    user = await create_user()
    with TestClient(app, client=(ip(), 123)) as client:
        tokens = client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
        ).json()
        headers = {"Authorization": "Bearer " + tokens["access_token"]}
        assert (
            client.post(
                "/api/v1/users/me/password",
                headers=headers,
                json={
                    "current_password": "wrong",
                    "new_password": PASSWORD,
                    "new_password_confirmation": PASSWORD,
                },
            ).status_code
            == 401
        )
        assert (
            client.put(
                "/api/v1/account/settings",
                headers=headers,
                json={
                    "name": user.name,
                    "email": user.email,
                    "email_notifications": True,
                    "current_password": "wrong",
                },
            ).status_code
            == 403
        )
        assert (
            client.put(
                "/api/v1/account/cpf",
                headers=headers,
                json={"cpf": make_cpf(), "current_password": PASSWORD},
            ).status_code
            == 429
        )
        assert client.get("/api/v1/users/me", headers=headers).status_code == 200
        assert (
            client.post(
                "/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}
            ).status_code
            == 204
        )
        assert client.get("/api/v1/users/me", headers=headers).status_code == 401


@pytest.mark.parametrize("path", ["/api/v1/auth/password/reset", "/api/v1/auth/invitations/accept"])
async def test_invalid_tokens_are_limited_without_resetting_other_flows(limits, path):
    token = uuid7().hex + uuid7().hex
    body = {
        "token": token,
        "password": PASSWORD,
        "password_confirmation": PASSWORD,
        "new_password": PASSWORD,
        "new_password_confirmation": PASSWORD,
        "cpf": "11144477735",
    }
    for expected in [422, 422, 429]:
        with TestClient(app, client=(ip(), 123)) as client:
            assert client.post(path, json=body).status_code == expected


def test_unavailable_counter_fails_closed_but_health_remains_available(limits, monkeypatch):
    def unavailable():
        raise SQLAlchemyError("synthetic-database-failure")

    monkeypatch.setattr(rate_limit, "AsyncSessionLocal", unavailable)
    with TestClient(app, client=(ip(), 123)) as client:
        response = failed_login(client, f"offline-{uuid7()}@example.com")
        assert response.status_code == 503
        assert response.headers["retry-after"] == "5"
        assert "synthetic-database-failure" not in response.text
        assert client.get("/health").status_code == 200


async def test_atomic_counter_is_shared_by_separate_python_processes(limits):
    key = bucket_key("test:workers", str(uuid7()))
    script = """
import asyncio,sys
from fastapi import HTTPException
from app.security.rate_limit import reserve_attempt
async def main():
    try:
        await reserve_attempt(sys.argv[1],3,120)
        print("allowed")
    except HTTPException as error:
        print(error.status_code)
asyncio.run(main())
"""

    def workers():
        processes = [
            subprocess.Popen(
                [sys.executable, "-c", script, key],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            for _ in range(6)
        ]
        results = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=45)
            assert process.returncode == 0, stderr
            results.append(stdout.strip())
        return results

    results = await asyncio.to_thread(workers)
    assert sorted(results) == ["429", "429", "429", "allowed", "allowed", "allowed"]
    async with AsyncSessionLocal() as db:
        assert (await db.get(AuthAttemptModel, key)).attempts == 3


async def test_counter_cleanup_and_late_success_do_not_remove_current_attempts(limits):
    old_key = bucket_key("test:stale", str(uuid7()))
    recent_key = bucket_key("test:recent", str(uuid7()))
    current_key = bucket_key("test:active", str(uuid7()))
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(
            [
                AuthAttemptModel(
                    bucket_key=old_key, attempts=2, expires_at=utcnow() - timedelta(days=2)
                ),
                AuthAttemptModel(
                    bucket_key=recent_key, attempts=2, expires_at=utcnow() - timedelta(hours=1)
                ),
            ]
        )
    old_reservation = await reserve_attempt(current_key, 2, 60)
    async with AsyncSessionLocal() as db, db.begin():
        await db.execute(
            update(AuthAttemptModel)
            .where(AuthAttemptModel.bucket_key == current_key)
            .values(expires_at=utcnow() - timedelta(seconds=1))
        )
    await reserve_attempt(current_key, 2, 60)
    await rate_limit.release_successful_attempt(old_reservation)
    await rate_limit.cleanup_expired_attempts()
    async with AsyncSessionLocal() as db:
        assert await db.get(AuthAttemptModel, old_key) is None
        assert await db.get(AuthAttemptModel, recent_key) is not None
        assert (await db.get(AuthAttemptModel, current_key)).attempts == 1
        keys = (await db.scalars(select(AuthAttemptModel.bucket_key))).all()
        assert all(len(key) == 64 and all(c in "0123456789abcdef" for c in key) for key in keys)
