import json
import os
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.care.account_models import ProfessionalProfileModel
from app.care.models import EmailOutboxModel, InvitationModel
from app.care.outbox import cipher
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)
PUBLIC = "/api/v1/nutritionist-applications"
ADMIN = "/api/v1/admin/nutritionist-applications"


async def test_public_application_requires_admin_review_before_first_access(monkeypatch, make_cpf):
    monkeypatch.setattr(get_settings(), "outbox_encryption_key", Fernet.generate_key().decode())
    password = "SyntheticPassword123!"
    async with AsyncSessionLocal() as db, db.begin():
        admin, patient = [
            UserModel(
                name="Conta de teste",
                email=f"{uuid4()}@example.com",
                role=role,
                status=UserStatus.ACTIVE,
                password_hash=PasswordHasher().hash(password),
            )
            for role in (UserRole.ADMIN, UserRole.PATIENT)
        ]
        db.add_all([admin, patient])
    requested = {
        "name": "Profissional de teste",
        "email": f"{uuid4()}@example.com",
        "crn": "CRN-11 12345",
        "cpf": make_cpf(),
    }
    rejected = {**requested, "email": f"{uuid4()}@example.com"}

    with TestClient(app) as client:

        def headers(user):
            result = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            assert result.status_code == 200
            return {"Authorization": f"Bearer {result.json()['access_token']}"}

        admin_headers = headers(admin)
        patient_headers = headers(patient)
        for data in (requested, rejected, {**requested, "email": requested["email"].upper()}):
            assert client.post(PUBLIC, json=data).status_code == 204
        assert client.post(PUBLIC, json={**requested, "crn": " "}).status_code == 422
        assert client.post(PUBLIC, json={**requested, "cpf": "11111111111"}).status_code == 422
        assert client.post(PUBLIC, json={**requested, "name": "Profissional 01"}).status_code == 422
        assert client.get(ADMIN).status_code == 401
        assert client.get(ADMIN, headers=patient_headers).status_code == 403
        page = client.get(ADMIN, headers=admin_headers)
        assert page.status_code == 200, page.text
        matching = [item for item in page.json()["items"] if item["email"] == requested["email"]]
        assert len(matching) == 1
        assert matching[0]["crn"] == requested["crn"]
        assert matching[0]["cpf"] == requested["cpf"]
        approve_id = matching[0]["id"]
        reject_id = next(
            item["id"] for item in page.json()["items"] if item["email"] == rejected["email"]
        )

        async with AsyncSessionLocal() as db:
            assert (
                await db.scalar(select(UserModel.id).where(UserModel.email == requested["email"]))
                is None
            )
        approve_path = f"{ADMIN}/{approve_id}/review"
        reject_path = f"{ADMIN}/{reject_id}/review"
        approve = {"decision": "approved"}
        assert client.post(approve_path, headers=patient_headers, json=approve).status_code == 403
        assert (
            client.post(
                reject_path, headers=admin_headers, json={"decision": "rejected"}
            ).status_code
            == 204
        )
        assert client.post(reject_path, headers=admin_headers, json=approve).status_code == 409
        for _ in range(2):
            response = client.post(approve_path, headers=admin_headers, json=approve)
            assert response.status_code == 204, response.text

        async with AsyncSessionLocal() as db:
            assert (
                await db.scalar(select(UserModel.id).where(UserModel.email == rejected["email"]))
                is None
            )
            user = await db.scalar(select(UserModel).where(UserModel.email == requested["email"]))
            assert user.role == UserRole.NUTRITIONIST
            assert user.status == UserStatus.BLOCKED
            assert user.cpf == requested["cpf"]
            assert (await db.get(ProfessionalProfileModel, user.id)).crn == requested["crn"]
            outbox = (
                await db.scalars(
                    select(EmailOutboxModel)
                    .join(InvitationModel)
                    .where(InvitationModel.user_id == user.id)
                )
            ).one()
            token = json.loads(cipher().decrypt(outbox.payload.encode()))["token"]

        acceptance = {
            "token": token,
            "password": password,
            "password_confirmation": password,
        }
        path = "/api/v1/auth/invitations/accept"
        assert client.post(path, json={**acceptance, "cpf": make_cpf()}).status_code == 409
        response = client.post(path, json={**acceptance, "cpf": requested["cpf"]})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "active"
        queue = client.get(ADMIN, headers=admin_headers).json()["items"]
        assert not {approve_id, reject_id}.intersection(item["id"] for item in queue)
