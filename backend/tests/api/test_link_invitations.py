import asyncio
import os
from datetime import timedelta
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.care.models import CareAssignmentModel, CareLinkInvitationModel
from app.care.policies import utcnow
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import AuditEventModel, UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


@pytest.mark.asyncio
async def test_patient_accepts_only_their_pending_invitation():
    password = "TestPassword123!"
    users = [
        UserModel(
            id=uuid7(),
            name=name,
            email=f"{role.value}-{uuid7()}@example.com",
            password_hash=PasswordHasher().hash(password),
            role=role,
            status=UserStatus.ACTIVE,
        )
        for name, role in [
            ("Admin Convites", UserRole.ADMIN),
            ("Nutri Um", UserRole.NUTRITIONIST),
            ("Nutri Dois", UserRole.NUTRITIONIST),
            ("Paciente Um", UserRole.PATIENT),
            ("Paciente Dois", UserRole.PATIENT),
        ]
    ]
    admin, nutritionist_one, nutritionist_two, patient, other_patient = users
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(users)

    with TestClient(app) as client:

        def headers(user):
            response = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            assert response.status_code == 200, response.text
            return {"Authorization": f"Bearer {response.json()['access_token']}"}

        admin_headers = headers(admin)
        first_headers = headers(nutritionist_one)
        second_headers = headers(nutritionist_two)
        patient_headers = headers(patient)
        other_headers = headers(other_patient)

        cancellable = client.post(
            "/api/v1/care-link-invitations",
            headers=first_headers,
            json={"patient_email": other_patient.email},
        )
        assert cancellable.status_code == 201, cancellable.text
        cancellable_id = cancellable.json()["id"]
        assert (
            client.delete(
                f"/api/v1/care-link-invitations/{cancellable_id}", headers=second_headers
            ).status_code
            == 404
        )
        assert (
            client.delete(
                f"/api/v1/care-link-invitations/{cancellable_id}", headers=first_headers
            ).status_code
            == 204
        )
        assert (
            client.post(
                f"/api/v1/care-link-invitations/{cancellable_id}/accept", headers=other_headers
            ).status_code
            == 409
        )

        assert (
            client.post(
                "/api/v1/care-link-invitations",
                headers=patient_headers,
                json={"patient_email": other_patient.email},
            ).status_code
            == 403
        )
        first = client.post(
            "/api/v1/care-link-invitations",
            headers=first_headers,
            json={"patient_email": patient.email},
        )
        assert first.status_code == 201, first.text
        first_id = first.json()["id"]
        duplicate = client.post(
            "/api/v1/care-link-invitations",
            headers=first_headers,
            json={"patient_email": patient.email},
        )
        assert duplicate.status_code == 201
        assert duplicate.json()["id"] == first_id
        second = client.post(
            "/api/v1/care-link-invitations",
            headers=second_headers,
            json={"patient_email": patient.email},
        )
        assert second.status_code == 201, second.text
        second_id = second.json()["id"]
        assert len(client.get("/api/v1/care-link-invitations", headers=patient_headers).json()) == 2
        assert len(client.get("/api/v1/care-link-invitations", headers=first_headers).json()) == 1
        assert client.get("/api/v1/care-link-invitations", headers=admin_headers).status_code == 403
        assert (
            client.get(f"/api/v1/patients/{patient.id}", headers=first_headers).status_code == 403
        )
        assert (
            client.post(
                f"/api/v1/care-link-invitations/{first_id}/accept", headers=other_headers
            ).status_code
            == 404
        )
        assert (
            client.post(
                f"/api/v1/care-link-invitations/{first_id}/accept", headers=first_headers
            ).status_code
            == 403
        )
        assert (
            client.post(
                f"/api/v1/care-link-invitations/{second_id}/decline", headers=patient_headers
            ).status_code
            == 204
        )
        accepted = client.post(
            f"/api/v1/care-link-invitations/{first_id}/accept", headers=patient_headers
        )
        assert accepted.status_code == 201, accepted.text
        assert accepted.json()["nutritionist_id"] == str(nutritionist_one.id)
        assert (
            client.post(
                f"/api/v1/care-link-invitations/{first_id}/accept", headers=patient_headers
            ).status_code
            == 409
        )
        assert client.get("/api/v1/care-link-invitations", headers=patient_headers).json() == []
        assert (
            client.get(f"/api/v1/patients/{patient.id}", headers=first_headers).status_code == 200
        )
        assert (
            client.get(f"/api/v1/patients/{patient.id}", headers=second_headers).status_code == 403
        )
        assert (
            client.post(
                "/api/v1/care-link-invitations",
                headers=second_headers,
                json={"patient_email": patient.email},
            ).status_code
            == 409
        )
        async with AsyncSessionLocal() as db:
            link = await db.scalar(
                select(CareAssignmentModel).where(
                    CareAssignmentModel.patient_id == patient.id,
                    CareAssignmentModel.ended_at.is_(None),
                )
            )
            assert link.actor_id == patient.id
            assert await db.scalar(
                select(AuditEventModel.id).where(
                    AuditEventModel.entity_id == link.id,
                    AuditEventModel.action == "accept_patient_invitation",
                )
            )


@pytest.mark.asyncio
async def test_admin_assignment_and_expiration_invalidate_invites():
    password = "TestPassword123!"
    users = [
        UserModel(
            id=uuid7(),
            name=name,
            email=f"{role.value}-{uuid7()}@example.com",
            password_hash=PasswordHasher().hash(password),
            role=role,
            status=UserStatus.ACTIVE,
        )
        for name, role in [
            ("Admin Outros", UserRole.ADMIN),
            ("Nutri Três", UserRole.NUTRITIONIST),
            ("Nutri Quatro", UserRole.NUTRITIONIST),
            ("Paciente Três", UserRole.PATIENT),
            ("Paciente Quatro", UserRole.PATIENT),
        ]
    ]
    admin, nutritionist, other_nutritionist, patient, other_patient = users
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all(users)
    with TestClient(app) as client:

        def headers(user):
            response = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            return {"Authorization": f"Bearer {response.json()['access_token']}"}

        admin_headers = headers(admin)
        nutritionist_headers = headers(nutritionist)
        patient_headers = headers(patient)
        other_patient_headers = headers(other_patient)
        invited = client.post(
            "/api/v1/care-link-invitations",
            headers=nutritionist_headers,
            json={"patient_email": patient.email},
        )
        assert invited.status_code == 201, invited.text
        invitation_id = invited.json()["id"]
        assigned = client.put(
            f"/api/v1/patients/{patient.id}/assignment",
            headers=admin_headers,
            json={"nutritionist_id": other_nutritionist.id.hex},
        )
        assert assigned.status_code == 200, assigned.text
        assert client.get("/api/v1/care-link-invitations", headers=patient_headers).json() == []
        assert (
            client.post(
                f"/api/v1/care-link-invitations/{invitation_id}/accept", headers=patient_headers
            ).status_code
            == 409
        )
        assert (
            client.get(f"/api/v1/patients/{patient.id}", headers=nutritionist_headers).status_code
            == 403
        )
        async with AsyncSessionLocal() as db:
            invitation = await db.get(CareLinkInvitationModel, invitation_id)
            assert invitation.canceled_at is not None

        expired = client.post(
            "/api/v1/care-link-invitations",
            headers=nutritionist_headers,
            json={"patient_email": other_patient.email},
        )
        assert expired.status_code == 201, expired.text
        expired_id = expired.json()["id"]
        async with AsyncSessionLocal() as db, db.begin():
            invitation = await db.get(CareLinkInvitationModel, expired_id)
            invitation.expires_at = utcnow() - timedelta(minutes=1)
        assert (
            client.post(
                f"/api/v1/care-link-invitations/{expired_id}/accept", headers=other_patient_headers
            ).status_code
            == 409
        )
        assert (
            client.get("/api/v1/care-link-invitations", headers=other_patient_headers).json() == []
        )
        renewed = client.post(
            "/api/v1/care-link-invitations",
            headers=nutritionist_headers,
            json={"patient_email": other_patient.email},
        )
        assert renewed.status_code == 201, renewed.text
        assert renewed.json()["id"] != expired_id
        assert (
            client.patch(
                f"/api/v1/users/{other_patient.id}",
                headers=admin_headers,
                json={"status": "blocked"},
            ).status_code
            == 200
        )
        async with AsyncSessionLocal() as db:
            invitation = await db.get(CareLinkInvitationModel, renewed.json()["id"])
            assert invitation.canceled_at is not None


@pytest.mark.asyncio
async def test_concurrent_acceptance_creates_one_active_link():
    password = "TestPassword123!"
    patient = UserModel(
        id=uuid7(),
        name="Paciente Concorrente",
        email=f"patient-{uuid7()}@example.com",
        password_hash=PasswordHasher().hash(password),
        role=UserRole.PATIENT,
        status=UserStatus.ACTIVE,
    )
    nutritionists = [
        UserModel(
            id=uuid7(),
            name=f"Nutri Concorrente {index}",
            email=f"nutritionist-{uuid7()}@example.com",
            password_hash=PasswordHasher().hash(password),
            role=UserRole.NUTRITIONIST,
            status=UserStatus.ACTIVE,
        )
        for index in ("Um", "Dois")
    ]
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all([patient, *nutritionists])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:

        async def token(user):
            response = await client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            assert response.status_code == 200, response.text
            return response.json()["access_token"]

        patient_token = await token(patient)
        invitation_ids = []
        for nutritionist in nutritionists:
            response = await client.post(
                "/api/v1/care-link-invitations",
                headers={"Authorization": f"Bearer {await token(nutritionist)}"},
                json={"patient_email": patient.email},
            )
            assert response.status_code == 201, response.text
            invitation_ids.append(response.json()["id"])

        responses = await asyncio.gather(
            *[
                client.post(
                    f"/api/v1/care-link-invitations/{invitation_id}/accept",
                    headers={"Authorization": f"Bearer {patient_token}"},
                )
                for invitation_id in invitation_ids
            ]
        )
        assert sorted(response.status_code for response in responses) == [201, 409]
    async with AsyncSessionLocal() as db:
        links = (
            await db.scalars(
                select(CareAssignmentModel).where(
                    CareAssignmentModel.patient_id == patient.id,
                    CareAssignmentModel.ended_at.is_(None),
                )
            )
        ).all()
        assert len(links) == 1
