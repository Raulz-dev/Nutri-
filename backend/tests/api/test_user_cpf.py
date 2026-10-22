import json
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.care.models import EmailOutboxModel, InvitationModel
from app.care.outbox import cipher
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole
from app.users.infrastructure.models import UserModel
from app.users.infrastructure.repository import SQLAlchemyUserRepository

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)
PASSWORD = "SyntheticCpfOnly123!"


def register(client, cpf):
    return client.post(
        "/api/v1/users",
        json={
            "name": "Paciente Sintético",
            "email": f"cpf-{uuid7()}@example.com",
            "password": PASSWORD,
            "role": "patient",
            "cpf": cpf,
        },
    )


def headers(client, email):
    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": "Bearer " + login.json()["access_token"]}


def test_registration_requires_valid_unique_cpf_and_keeps_it_private(make_cpf):
    with TestClient(app) as client:
        assert register(client, "11111111111").status_code == 422
        assert register(client, None).status_code == 422
        missing = client.post(
            "/api/v1/users",
            json={
                "name": "Paciente Sintético",
                "email": f"cpf-{uuid7()}@example.com",
                "password": PASSWORD,
                "role": "patient",
            },
        )
        assert missing.status_code == 422
        cpf = make_cpf()
        formatted = f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
        created = register(client, formatted)
        assert created.status_code == 201, created.text
        assert "cpf" not in created.json()
        assert register(client, cpf).status_code == 409
        auth = headers(client, created.json()["email"])
        assert client.get("/api/v1/users/me", headers=auth).json()["cpf"] == cpf
        assert "cpf" not in client.get(f"/api/v1/users/{created.json()['id']}", headers=auth).json()
        assert (
            client.patch(
                f"/api/v1/users/{created.json()['id']}", headers=auth, json={"cpf": make_cpf()}
            ).status_code
            == 422
        )


async def test_nutritionist_first_access_requires_cpf_unique_across_roles(make_cpf):
    admin = UserModel(
        name="Admin Sintético",
        email=f"admin-{uuid7()}@example.com",
        password_hash=PasswordHasher().hash(PASSWORD),
        role=UserRole.ADMIN,
    )
    async with AsyncSessionLocal() as db, db.begin():
        db.add(admin)
    with TestClient(app) as client:
        cpf = make_cpf()
        assert register(client, cpf).status_code == 201
        auth = headers(client, admin.email)
        invited = client.post(
            "/api/v1/admin/invitations",
            headers=auth,
            json={"name": "Nutricionista Sintético", "email": f"nutri-{uuid7()}@example.com"},
        )
        assert invited.status_code == 201, invited.text
        async with AsyncSessionLocal() as db:
            row = await db.scalar(
                select(EmailOutboxModel)
                .join(InvitationModel)
                .where(InvitationModel.user_id == invited.json()["id"])
            )
            token = json.loads(cipher().decrypt(row.payload.encode()))["token"]
        body = {"token": token, "password": PASSWORD, "password_confirmation": PASSWORD}
        assert client.post("/api/v1/auth/invitations/accept", json=body).status_code == 422
        assert (
            client.post("/api/v1/auth/invitations/accept", json=body | {"cpf": cpf}).status_code
            == 409
        )
        own_cpf = make_cpf()
        accepted = client.post("/api/v1/auth/invitations/accept", json=body | {"cpf": own_cpf})
        assert accepted.status_code == 200, accepted.text
        assert "cpf" not in accepted.json()
        assert "cpf" not in client.get("/api/v1/users", headers=auth).json()["items"][0]
        nutri_auth = headers(client, accepted.json()["email"])
        assert client.get("/api/v1/users/me", headers=nutri_auth).json()["cpf"] == own_cpf


async def test_legacy_cpf_completion_reauthenticates_and_is_immutable(make_cpf):
    legacy = UserModel(
        name="Paciente Legado",
        email=f"legacy-{uuid7()}@example.com",
        password_hash=PasswordHasher().hash(PASSWORD),
        role=UserRole.PATIENT,
    )
    async with AsyncSessionLocal() as db, db.begin():
        db.add(legacy)
    async with AsyncSessionLocal() as db:
        stale_user = await SQLAlchemyUserRepository(db).find_by_id(legacy.id)
    with TestClient(app) as client:
        auth = headers(client, legacy.email)
        assert client.get("/api/v1/users/me", headers=auth).json()["cpf"] is None
        cpf = make_cpf()
        assert (
            client.put(
                "/api/v1/account/cpf", headers=auth, json={"cpf": cpf, "current_password": "wrong"}
            ).status_code
            == 403
        )
        saved = client.put(
            "/api/v1/account/cpf", headers=auth, json={"cpf": cpf, "current_password": PASSWORD}
        )
        assert saved.status_code == 200, saved.text
        assert (
            client.put(
                "/api/v1/account/cpf",
                headers=auth,
                json={"cpf": make_cpf(), "current_password": PASSWORD},
            ).status_code
            == 409
        )
        assert client.get("/api/v1/users/me", headers=auth).json()["cpf"] == cpf
    # A profile/password update loaded before CPF completion must never clear it.
    async with AsyncSessionLocal() as db, db.begin():
        stale_user.change_name("Paciente Atualizado")
        updated = await SQLAlchemyUserRepository(db).update(stale_user)
        assert updated.cpf == cpf


def test_concurrent_registration_cannot_duplicate_cpf(make_cpf):
    cpf = make_cpf()

    def create(_):
        with TestClient(app) as client:
            return register(client, cpf).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(create, range(2))) == [201, 409]
