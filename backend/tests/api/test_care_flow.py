import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.care.invites import cipher
from app.care.models import CareAssignmentModel, EmailOutboxModel, InvitationModel
from app.care.policies import utcnow
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import AuditEventModel, UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


@pytest.mark.asyncio
async def test_admin_lists_deactivated_patients_and_searches_email():
    password = "TestPassword123!"
    admin = UserModel(
        id=uuid7(),
        name="Admin Busca",
        email=f"admin-{uuid7()}@example.com",
        password_hash=PasswordHasher().hash(password),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    nutritionist = UserModel(
        id=uuid7(),
        name="Nutricionista Busca",
        email=f"nutritionist-{uuid7()}@example.com",
        password_hash=PasswordHasher().hash(password),
        role=UserRole.NUTRITIONIST,
        status=UserStatus.ACTIVE,
    )
    patient = UserModel(
        id=uuid7(),
        name="Paciente Busca",
        email=f"patient-{uuid7()}@example.com",
        password_hash=PasswordHasher().hash(password),
        role=UserRole.PATIENT,
        status=UserStatus.BLOCKED,
        deactivated_at=utcnow(),
    )
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all([admin, nutritionist, patient])

    with TestClient(app) as client:

        def headers(user):
            login = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            assert login.status_code == 200, login.text
            return {"Authorization": f"Bearer {login.json()['access_token']}"}

        admin_headers = headers(admin)
        nutritionist_headers = headers(nutritionist)
        default = client.get("/api/v1/patients", headers=admin_headers, params={"q": patient.email})
        assert default.status_code == 200
        assert default.json()["total"] == 0
        included = client.get(
            "/api/v1/patients",
            headers=admin_headers,
            params={"q": patient.email.upper(), "include_deactivated": "true"},
        )
        assert included.status_code == 200, included.text
        assert included.json()["total"] == 1
        assert included.json()["items"][0]["deactivated_at"] is not None
        denied = client.get(
            "/api/v1/patients",
            headers=nutritionist_headers,
            params={"include_deactivated": "true"},
        )
        assert denied.status_code == 403


@pytest.mark.asyncio
async def test_invitation_assignment_and_access_lifecycle(monkeypatch):
    admin_email = f"admin-{uuid7()}@example.com"
    patient_email = f"patient-{uuid7()}@example.com"
    professional_email = f"nutritionist-{uuid7()}@example.com"
    admin = UserModel(
        id=uuid7(),
        name="Admin Teste",
        email=admin_email,
        password_hash=PasswordHasher().hash("TestPassword123!"),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    async with AsyncSessionLocal() as db, db.begin():
        db.add(admin)
    with TestClient(app) as client:
        assert client.get("/ready").status_code == 200
        monkeypatch.setattr(get_settings(), "metrics_token", "test-metrics-token")
        metrics = client.get("/metrics", headers={"Authorization": "Bearer test-metrics-token"})
        assert metrics.status_code == 200
        assert "email_outbox_pending" in metrics.text
        login = client.post(
            "/api/v1/auth/login", json={"email": admin_email, "password": "TestPassword123!"}
        )
        assert login.status_code == 200, login.text
        admin_token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        registration = client.post(
            "/api/v1/users",
            json={
                "name": "Paciente Teste",
                "email": patient_email,
                "password": "TestPassword123!",
                "role": "patient",
            },
        )
        assert registration.status_code == 201, registration.text
        patient_id = registration.json()["id"]
        patient_token = client.post(
            "/api/v1/auth/login", json={"email": patient_email, "password": "TestPassword123!"}
        ).json()["access_token"]
        assert (
            client.patch(
                f"/api/v1/users/{patient_id}",
                headers=headers,
                json={"role": "nutritionist"},
            ).status_code
            == 409
        )
        assert (
            client.get(
                "/api/v1/users/me", headers={"Authorization": f"Bearer {patient_token}"}
            ).json()["role"]
            == "patient"
        )
        invited = client.post(
            "/api/v1/admin/invitations",
            headers=headers,
            json={"name": "Nutricionista Teste", "email": professional_email},
        )
        assert invited.status_code == 201, invited.text
        nutritionist_id = invited.json()["id"]
        assert invited.json()["status"] == "blocked"
        assert (
            client.patch(
                f"/api/v1/users/{nutritionist_id}", headers=headers, json={"status": "active"}
            ).status_code
            == 409
        )
        blocked_login = client.post(
            "/api/v1/auth/login", json={"email": professional_email, "password": "TestPassword123!"}
        )
        assert blocked_login.status_code == 401
        async with AsyncSessionLocal() as db:
            row = await db.scalar(
                select(EmailOutboxModel)
                .join(InvitationModel)
                .where(InvitationModel.user_id == nutritionist_id)
            )
            assert row.payload and "token" not in row.payload
            import json

            token = json.loads(cipher().decrypt(row.payload.encode()))["token"]
        accepted = client.post(
            "/api/v1/auth/invitations/accept",
            json={
                "token": token,
                "password": "Professional123!",
                "password_confirmation": "Professional123!",
            },
        )
        assert accepted.status_code == 200, accepted.text
        assert (
            client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": token,
                    "password": "Professional123!",
                    "password_confirmation": "Professional123!",
                },
            ).status_code
            == 422
        )
        nutritionist_token = client.post(
            "/api/v1/auth/login", json={"email": professional_email, "password": "Professional123!"}
        ).json()["access_token"]
        n_headers = {"Authorization": f"Bearer {nutritionist_token}"}
        p_headers = {"Authorization": f"Bearer {patient_token}"}
        assert client.get(f"/api/v1/patients/{patient_id}", headers=n_headers).status_code == 403
        assert (
            client.put(
                f"/api/v1/patients/{patient_id}/assignment",
                headers=n_headers,
                json={"nutritionist_id": nutritionist_id},
            ).status_code
            == 403
        )
        assert (
            client.get(f"/api/v1/patients/{nutritionist_id}", headers=p_headers).status_code == 404
        )
        assigned = client.put(
            f"/api/v1/patients/{patient_id}/assignment",
            headers=headers,
            json={"nutritionist_id": nutritionist_id},
        )
        assert assigned.status_code == 200, assigned.text
        assert client.get("/api/v1/admin/audit-events", headers=p_headers).status_code == 403
        events = client.get("/api/v1/admin/audit-events?action=assign", headers=headers)
        assert events.status_code == 200
        assert any(item["entity_id"] for item in events.json()["items"])
        assert (
            client.put(
                f"/api/v1/patients/{patient_id}/assignment",
                headers=headers,
                json={"nutritionist_id": nutritionist_id},
            ).status_code
            == 200
        )
        assert client.get(f"/api/v1/patients/{patient_id}", headers=n_headers).status_code == 200
        assert client.get("/api/v1/patients", headers=n_headers).json()["total"] == 1
        assert client.delete(f"/api/v1/users/{nutritionist_id}", headers=headers).status_code == 409
        assert (
            client.delete(f"/api/v1/patients/{patient_id}/assignment", headers=headers).status_code
            == 204
        )
        assert client.get(f"/api/v1/patients/{patient_id}", headers=n_headers).status_code == 403
        assert client.delete(f"/api/v1/users/{nutritionist_id}", headers=headers).status_code == 204
        assert client.get("/api/v1/users/me", headers=n_headers).status_code == 401
        async with AsyncSessionLocal() as db:
            assert (
                await db.scalar(select(UserModel).where(UserModel.id == nutritionist_id))
            ).deactivated_at
            assert await db.scalar(
                select(CareAssignmentModel.id).where(CareAssignmentModel.patient_id == patient_id)
            )
            assert await db.scalar(
                select(AuditEventModel.id).where(
                    AuditEventModel.entity_id == nutritionist_id,
                    AuditEventModel.action == "deactivate",
                )
            )


@pytest.mark.asyncio
async def test_deactivation_cancels_pending_invitation():
    admin_email = f"admin-{uuid7()}@example.com"
    nutritionist_email = f"nutritionist-{uuid7()}@example.com"
    async with AsyncSessionLocal() as db, db.begin():
        db.add(
            UserModel(
                id=uuid7(),
                name="Admin Cancelamento",
                email=admin_email,
                password_hash=PasswordHasher().hash("TestPassword123!"),
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
            )
        )
    with TestClient(app) as client:
        access = client.post(
            "/api/v1/auth/login", json={"email": admin_email, "password": "TestPassword123!"}
        ).json()["access_token"]
        headers = {"Authorization": f"Bearer {access}"}
        invited = client.post(
            "/api/v1/admin/invitations",
            headers=headers,
            json={"name": "Nutri Cancelada", "email": nutritionist_email},
        )
        assert invited.status_code == 201, invited.text
        user_id = invited.json()["id"]
        assert client.delete(f"/api/v1/users/{user_id}", headers=headers).status_code == 204
    async with AsyncSessionLocal() as db:
        invitation = await db.scalar(
            select(InvitationModel).where(InvitationModel.user_id == user_id)
        )
        outbox = await db.scalar(
            select(EmailOutboxModel).where(EmailOutboxModel.invitation_id == invitation.id)
        )
        assert invitation.used_at is not None
        assert outbox.payload is None
        assert outbox.failed_at is not None


@pytest.mark.asyncio
async def test_expired_invitation_fails():
    admin_email = f"admin-{uuid7()}@example.com"
    nutritionist_email = f"nutritionist-{uuid7()}@example.com"
    async with AsyncSessionLocal() as db, db.begin():
        db.add(
            UserModel(
                id=uuid7(),
                name="Admin Expiração",
                email=admin_email,
                password_hash=PasswordHasher().hash("TestPassword123!"),
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
            )
        )
    with TestClient(app) as client:
        access = client.post(
            "/api/v1/auth/login", json={"email": admin_email, "password": "TestPassword123!"}
        ).json()["access_token"]
        response = client.post(
            "/api/v1/admin/invitations",
            headers={"Authorization": f"Bearer {access}"},
            json={"name": "Nutri Expiração", "email": nutritionist_email},
        )
        assert response.status_code == 201, response.text
        async with AsyncSessionLocal() as db, db.begin():
            invitation = await db.scalar(
                select(InvitationModel).where(InvitationModel.user_id == response.json()["id"])
            )
            invitation.expires_at = utcnow() - timedelta(minutes=1)
        async with AsyncSessionLocal() as db:
            row = await db.scalar(
                select(EmailOutboxModel).where(EmailOutboxModel.invitation_id == invitation.id)
            )
            import json

            token = json.loads(cipher().decrypt(row.payload.encode()))["token"]
        assert (
            client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": token,
                    "password": "TestPassword123!",
                    "password_confirmation": "TestPassword123!",
                },
            ).status_code
            == 422
        )
        resent = client.post(
            f"/api/v1/admin/invitations/{response.json()['id']}/resend",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert resent.status_code == 200, resent.text
        async with AsyncSessionLocal() as db:
            new_invitation = await db.scalar(
                select(InvitationModel).where(
                    InvitationModel.user_id == response.json()["id"],
                    InvitationModel.used_at.is_(None),
                )
            )
            new_outbox = await db.scalar(
                select(EmailOutboxModel).where(EmailOutboxModel.invitation_id == new_invitation.id)
            )
            new_token = json.loads(cipher().decrypt(new_outbox.payload.encode()))["token"]
        assert new_token != token
        assert (
            client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": token,
                    "password": "TestPassword123!",
                    "password_confirmation": "TestPassword123!",
                },
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": new_token,
                    "password": "TestPassword123!",
                    "password_confirmation": "TestPassword123!",
                },
            ).status_code
            == 200
        )


@pytest.mark.asyncio
async def test_outbox_delivers_once_and_clears_token(monkeypatch):
    from app.care.email_worker import deliver_one
    from app.users.infrastructure.email import SMTPPasswordResetSender

    sent = []
    monkeypatch.setattr(
        SMTPPasswordResetSender, "_send", lambda self, message: sent.append(message)
    )
    admin_email = f"admin-{uuid7()}@example.com"
    nutritionist_email = f"nutritionist-{uuid7()}@example.com"
    async with AsyncSessionLocal() as db, db.begin():
        db.add(
            UserModel(
                id=uuid7(),
                name="Admin Envio",
                email=admin_email,
                password_hash=PasswordHasher().hash("TestPassword123!"),
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
            )
        )
    with TestClient(app) as client:
        access = client.post(
            "/api/v1/auth/login", json={"email": admin_email, "password": "TestPassword123!"}
        ).json()["access_token"]
        response = client.post(
            "/api/v1/admin/invitations",
            headers={"Authorization": f"Bearer {access}"},
            json={"name": "Nutri Envio", "email": nutritionist_email},
        )
        assert response.status_code == 201, response.text
    async with AsyncSessionLocal() as db:
        invitation = await db.scalar(
            select(InvitationModel).where(InvitationModel.user_id == response.json()["id"])
        )
        outbox_id = (
            await db.scalar(
                select(EmailOutboxModel).where(EmailOutboxModel.invitation_id == invitation.id)
            )
        ).id
    for _ in range(30):
        if sent and any(message["To"] == nutritionist_email for message in sent):
            break
        if not await deliver_one():
            break
    assert any(message["To"] == nutritionist_email for message in sent)
    message = next(message for message in sent if message["To"] == nutritionist_email)
    text_body = message.get_body(preferencelist=("plain",)).get_content()
    link = next(line for line in text_body.splitlines() if "token=" in line)
    invitation_token = parse_qs(urlparse(link).query)["token"][0]
    with TestClient(app) as client:
        accepted = client.post(
            "/api/v1/auth/invitations/accept",
            json={
                "token": invitation_token,
                "password": "TestPassword123!",
                "password_confirmation": "TestPassword123!",
            },
        )
        assert accepted.status_code == 200, accepted.text
    async with AsyncSessionLocal() as db:
        row = await db.get(EmailOutboxModel, outbox_id)
        assert row.delivered_at and row.payload is None


@pytest.mark.asyncio
async def test_invitation_delivery_status_and_resend_interval():
    admin_email = f"admin-{uuid7()}@example.com"
    nutritionist_email = f"nutritionist-{uuid7()}@example.com"
    patient_email = f"patient-{uuid7()}@example.com"
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(
            [
                UserModel(
                    id=uuid7(),
                    name="Admin Convites",
                    email=admin_email,
                    password_hash=PasswordHasher().hash("TestPassword123!"),
                    role=UserRole.ADMIN,
                    status=UserStatus.ACTIVE,
                ),
                UserModel(
                    id=uuid7(),
                    name="Paciente Convites",
                    email=patient_email,
                    password_hash=PasswordHasher().hash("TestPassword123!"),
                    role=UserRole.PATIENT,
                    status=UserStatus.ACTIVE,
                ),
            ]
        )
    with TestClient(app) as client:
        token = client.post(
            "/api/v1/auth/login",
            json={"email": admin_email, "password": "TestPassword123!"},
        ).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        response = client.post(
            "/api/v1/admin/invitations",
            headers=headers,
            json={"name": "Nutri Convites", "email": nutritionist_email},
        )
        assert response.status_code == 201, response.text
        user_id = response.json()["id"]
        statuses_url = "/api/v1/admin/invitations/statuses"
        resend_url = f"/api/v1/admin/invitations/{user_id}/resend"

        def current_status():
            response = client.get(statuses_url, headers=headers)
            assert response.status_code == 200, response.text
            return next(item for item in response.json() if item["user_id"] == user_id)

        assert current_status()["status"] == "pending"
        assert client.post(resend_url, headers=headers).status_code == 409
        assert client.get(statuses_url).status_code == 401
        patient_token = client.post(
            "/api/v1/auth/login",
            json={"email": patient_email, "password": "TestPassword123!"},
        ).json()["access_token"]
        assert (
            client.get(
                statuses_url, headers={"Authorization": f"Bearer {patient_token}"}
            ).status_code
            == 403
        )

        async with AsyncSessionLocal() as db, db.begin():
            invitation = await db.scalar(
                select(InvitationModel).where(InvitationModel.user_id == user_id)
            )
            outbox = await db.scalar(
                select(EmailOutboxModel).where(EmailOutboxModel.invitation_id == invitation.id)
            )
            outbox.delivered_at = utcnow()
            outbox.payload = None
        sent = current_status()
        assert sent["status"] == "sent"
        assert sent["resend_available_at"] is not None
        assert client.post(resend_url, headers=headers).status_code == 409

        async with AsyncSessionLocal() as db, db.begin():
            outbox = await db.get(EmailOutboxModel, outbox.id)
            outbox.delivered_at = utcnow() - timedelta(hours=1, seconds=1)
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(
                executor.map(
                    lambda _: client.post(resend_url, headers=headers).status_code,
                    range(2),
                )
            )
        assert sorted(outcomes) == [200, 409]
        assert current_status()["status"] == "pending"

        async with AsyncSessionLocal() as db, db.begin():
            invitation = await db.scalar(
                select(InvitationModel).where(
                    InvitationModel.user_id == user_id, InvitationModel.used_at.is_(None)
                )
            )
            outbox = await db.scalar(
                select(EmailOutboxModel).where(EmailOutboxModel.invitation_id == invitation.id)
            )
            outbox.failed_at = utcnow()
            outbox.payload = None
        assert current_status()["status"] == "failed"
        assert client.post(resend_url, headers=headers).status_code == 200

        async with AsyncSessionLocal() as db, db.begin():
            invitation = await db.scalar(
                select(InvitationModel).where(
                    InvitationModel.user_id == user_id, InvitationModel.used_at.is_(None)
                )
            )
            invitation.expires_at = utcnow() - timedelta(seconds=1)
        assert current_status()["status"] == "expired"
        assert client.post(resend_url, headers=headers).status_code == 200
