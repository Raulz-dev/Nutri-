import os
from datetime import timedelta
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient

from app.care.models import CareAssignmentModel, EmailOutboxModel, InvitationModel
from app.care.plan_models import MealPlanModel
from app.care.plan_router import local_today
from app.care.policies import utcnow
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


@pytest.mark.asyncio
async def test_admin_dashboard_uses_database_and_blocks_other_roles():
    password = "TestPassword123!"
    hashed = PasswordHasher().hash(password)
    admin = UserModel(
        id=uuid7(),
        name="Admin Painel",
        email=f"admin-dashboard-{uuid7()}@example.com",
        password_hash=hashed,
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    patient = UserModel(
        id=uuid7(),
        name="Paciente Painel",
        email=f"patient-dashboard-{uuid7()}@example.com",
        password_hash=hashed,
        role=UserRole.PATIENT,
        status=UserStatus.ACTIVE,
    )
    failed_nutritionist = UserModel(
        id=uuid7(),
        name="Nutri Falha",
        email=f"failed-dashboard-{uuid7()}@example.com",
        password_hash=hashed,
        role=UserRole.NUTRITIONIST,
        status=UserStatus.BLOCKED,
    )
    delayed_nutritionist = UserModel(
        id=uuid7(),
        name="Nutri Atraso",
        email=f"delayed-dashboard-{uuid7()}@example.com",
        password_hash=hashed,
        role=UserRole.NUTRITIONIST,
        status=UserStatus.BLOCKED,
    )
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all([admin, patient, failed_nutritionist, delayed_nutritionist])
    with TestClient(app) as client:

        def token(user):
            response = client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": password}
            )
            assert response.status_code == 200, response.text
            return {"Authorization": f"Bearer {response.json()['access_token']}"}

        admin_headers = token(admin)
        patient_headers = token(patient)
        assert client.get("/api/v1/dashboards/admin", headers=patient_headers).status_code == 403
        response = client.get("/api/v1/dashboards/admin", headers=admin_headers)
        assert response.status_code == 200, response.text
        before = response.json()
        assert before["total"] == before["active"] + before["blocked"]
        assert before["total"] == sum(before["roles"].values())
        assert before["roles"]["admin"] >= 1
        assert before["roles"]["patient"] >= 1
        assert len(before["months"]) == 6
        assert any(item["id"] == str(patient.id) for item in before["recent_accesses"])

        async with AsyncSessionLocal() as db, db.begin():
            invitation = InvitationModel(
                id=uuid7(),
                user_id=failed_nutritionist.id,
                token_hash=uuid7().hex,
                expires_at=utcnow() + timedelta(days=1),
            )
            db.add(invitation)
            await db.flush()
            db.add(
                EmailOutboxModel(
                    invitation_id=invitation.id,
                    payload=None,
                    attempts=1,
                    failed_at=utcnow(),
                )
            )
            delayed_invitation = InvitationModel(
                id=uuid7(),
                user_id=delayed_nutritionist.id,
                token_hash=uuid7().hex,
                expires_at=utcnow() + timedelta(days=1),
            )
            db.add(delayed_invitation)
            await db.flush()
            db.add(
                EmailOutboxModel(
                    invitation_id=delayed_invitation.id,
                    payload="dados fictícios",
                    attempts=0,
                    available_at=utcnow() - timedelta(minutes=11),
                )
            )
        after = client.get("/api/v1/dashboards/admin", headers=admin_headers).json()
        assert after["failed_invitation_deliveries"] == before["failed_invitation_deliveries"] + 1
        assert after["delayed_invitation_deliveries"] == before["delayed_invitation_deliveries"] + 1

        async with AsyncSessionLocal() as db, db.begin():
            invitation.used_at = utcnow()
            db.add(invitation)
            resent = InvitationModel(
                id=uuid7(),
                user_id=failed_nutritionist.id,
                token_hash=uuid7().hex,
                expires_at=utcnow() + timedelta(days=1),
            )
            db.add(resent)
            await db.flush()
            db.add(
                EmailOutboxModel(
                    invitation_id=resent.id,
                    payload=None,
                    attempts=0,
                    delivered_at=utcnow(),
                )
            )
        resolved = client.get("/api/v1/dashboards/admin", headers=admin_headers).json()
        assert resolved["failed_invitation_deliveries"] == before["failed_invitation_deliveries"]


@pytest.mark.asyncio
async def test_nutritionist_dashboard_counts_only_current_linked_plans():
    password = "TestPassword123!"
    hashed = PasswordHasher().hash(password)
    nutritionist = UserModel(
        id=uuid7(),
        name="Nutri Painel",
        email=f"nutri-dashboard-{uuid7()}@example.com",
        password_hash=hashed,
        role=UserRole.NUTRITIONIST,
        status=UserStatus.ACTIVE,
    )
    patients = [
        UserModel(
            id=uuid7(),
            name=f"Paciente Painel {name}",
            email=f"patient-dashboard-{uuid7()}@example.com",
            password_hash=hashed,
            role=UserRole.PATIENT,
            status=UserStatus.ACTIVE,
        )
        for name in ("Um", "Dois")
    ]
    async with AsyncSessionLocal() as db, db.begin():
        db.add_all([nutritionist, *patients])
        await db.flush()
        db.add_all(
            [
                CareAssignmentModel(
                    patient_id=patient.id, nutritionist_id=nutritionist.id, actor_id=nutritionist.id
                )
                for patient in patients
            ]
        )
        db.add(
            MealPlanModel(
                patient_id=patients[0].id,
                author_id=nutritionist.id,
                author_name=nutritionist.name,
                title="Plano de teste",
                start_on=local_today(),
                end_on=local_today() + timedelta(days=7),
                effective_end_on=local_today() + timedelta(days=7),
                water_liters=2,
                guidance="",
                meals=[
                    {
                        "id": str(uuid7()),
                        "title": "Almoço",
                        "time": "12:30",
                        "foods": [{"id": str(uuid7()), "name": "Arroz", "grams": 100}],
                        "substitutions": [],
                        "calories": 400,
                        "protein": 20,
                        "carbs": 50,
                        "fats": 10,
                    }
                ],
                status="published",
                revision=1,
                published_at=utcnow(),
            )
        )
    with TestClient(app) as client:
        login = client.post(
            "/api/v1/auth/login", json={"email": nutritionist.email, "password": password}
        )
        assert login.status_code == 200, login.text
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        response = client.get("/api/v1/dashboards/nutritionist/plans", headers=headers)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["active_plans"] == 1
        assert result["patients_without_plan"] == 1
        assert result["pending_patients"] == [{"id": str(patients[1].id), "name": patients[1].name}]
        assert client.get("/api/v1/dashboards/admin", headers=headers).status_code == 403
        patient_login = client.post(
            "/api/v1/auth/login", json={"email": patients[0].email, "password": password}
        )
        assert patient_login.status_code == 200, patient_login.text
        patient_headers = {"Authorization": f"Bearer {patient_login.json()['access_token']}"}
        current = client.get(
            f"/api/v1/patients/{patients[0].id}/plans/current", headers=patient_headers
        )
        assert current.status_code == 200, current.text
        assert current.json()["title"] == "Plano de teste"
