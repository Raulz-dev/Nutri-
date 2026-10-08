import os
from datetime import date, timedelta
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.care.clinical_models import (
    FollowUpModel,
    MeasurementModel,
    PatientIntakeRevisionModel,
    WeightGoalRevisionModel,
)
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import AuditEventModel, UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


def intake_data(goal="weight-loss"):
    return {
        "version": 1,
        "goal": {"primary": goal, "details": "Mais disposição"},
        "food": {
            "liked": ["Banana"],
            "disliked": [],
            "avoided": [],
            "pattern": "omnivore",
            "otherPattern": "",
        },
        "restrictions": {
            "allergies": [],
            "noAllergies": True,
            "intolerances": [],
            "noIntolerances": False,
            "other": "",
        },
        "health": {
            "conditions": [],
            "medications": [],
            "supplements": [],
            "digestiveSymptoms": "",
        },
        "routine": {
            "mealsPerDay": "4",
            "eatingSchedule": "",
            "waterLiters": "2.0",
            "eatingOutFrequency": "",
            "difficulties": "",
        },
        "lifestyle": {
            "activityType": "",
            "activityFrequency": "",
            "sleepHours": "8",
            "alcohol": "",
            "smoking": "",
        },
        "observations": "",
    }


@pytest.mark.asyncio
async def test_clinical_history_authorship_and_transfer():
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
            ("Admin Clínico", UserRole.ADMIN),
            ("Nutri Primeira", UserRole.NUTRITIONIST),
            ("Nutri Segunda", UserRole.NUTRITIONIST),
            ("Paciente Clínico", UserRole.PATIENT),
            ("Paciente Estranho", UserRole.PATIENT),
        ]
    ]
    admin, nutritionist, second_nutritionist, patient, other_patient = users
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
        first_headers = headers(nutritionist)
        second_headers = headers(second_nutritionist)
        patient_headers = headers(patient)
        other_headers = headers(other_patient)
        base = f"/api/v1/patients/{patient.id}"

        assert client.get(f"{base}/intake", headers=patient_headers).json() == {
            "intake": None,
            "revision": 0,
            "author_id": None,
            "updated_at": None,
        }
        assert client.get(f"{base}/intake", headers=admin_headers).status_code == 403
        assert client.get(f"{base}/intake", headers=other_headers).status_code == 403
        assert client.get(f"{base}/measurements", headers=first_headers).status_code == 403
        assert client.get(f"{base}/weight-goal", headers=other_headers).status_code == 403

        first = client.put(
            f"{base}/intake",
            headers=patient_headers,
            json={"intake": intake_data(), "expected_revision": 0},
        )
        assert first.status_code == 200, first.text
        assert first.json()["revision"] == 1
        assert first.json()["author_id"] == str(patient.id)
        assert (
            client.put(
                f"{base}/intake",
                headers=patient_headers,
                json={"intake": intake_data("performance"), "expected_revision": 0},
            ).status_code
            == 409
        )
        second = client.put(
            f"{base}/intake",
            headers=patient_headers,
            json={"intake": intake_data("performance"), "expected_revision": 1},
        )
        assert second.status_code == 200, second.text
        assert second.json()["revision"] == 2
        assert (
            client.put(
                f"{base}/intake",
                headers=first_headers,
                json={"intake": intake_data(), "expected_revision": 2},
            ).status_code
            == 403
        )
        assert (
            client.put(
                f"{base}/intake",
                headers=patient_headers,
                json={
                    "intake": {
                        **intake_data(),
                        "restrictions": {
                            **intake_data()["restrictions"],
                            "allergies": ["Amendoim"],
                        },
                    },
                    "expected_revision": 2,
                },
            ).status_code
            == 422
        )

        assigned = client.put(
            f"{base}/assignment",
            headers=admin_headers,
            json={"nutritionist_id": str(nutritionist.id)},
        )
        assert assigned.status_code == 200, assigned.text
        assert client.get(f"{base}/intake", headers=first_headers).json()["revision"] == 2
        assert client.get(f"{base}/weight-goal", headers=patient_headers).json() == {
            "target_kg": None,
            "revision": 0,
            "author_id": None,
            "author_name": None,
            "updated_at": None,
        }
        first_goal = client.put(
            f"{base}/weight-goal",
            headers=first_headers,
            json={"target_kg": 68.0, "expected_revision": 0},
        )
        assert first_goal.status_code == 200, first_goal.text
        assert first_goal.json()["revision"] == 1
        assert first_goal.json()["author_id"] == str(nutritionist.id)
        patient_goal = client.get(f"{base}/weight-goal", headers=patient_headers)
        assert patient_goal.json()["target_kg"] == 68.0
        assert (
            client.put(
                f"{base}/weight-goal",
                headers=first_headers,
                json={"target_kg": 0, "expected_revision": 1},
            ).status_code
            == 422
        )
        assert (
            client.put(
                f"{base}/weight-goal",
                headers=patient_headers,
                json={"target_kg": 67.0, "expected_revision": 1},
            ).status_code
            == 403
        )
        assert (
            client.put(
                f"{base}/weight-goal",
                headers=first_headers,
                json={"target_kg": 67.0, "expected_revision": 0},
            ).status_code
            == 409
        )
        second_goal = client.put(
            f"{base}/weight-goal",
            headers=first_headers,
            json={"target_kg": 67.0, "expected_revision": 1},
        )
        assert second_goal.status_code == 200, second_goal.text
        assert second_goal.json()["revision"] == 2

        measurement = client.post(
            f"{base}/measurements",
            headers=first_headers,
            json={
                "measured_on": date.today().isoformat(),
                "weight_kg": 72.3,
                "body_fat_pct": 25.1,
                "note": "Acompanhamento inicial",
            },
        )
        assert measurement.status_code == 201, measurement.text
        assert measurement.json()["author_id"] == str(nutritionist.id)
        assert measurement.json()["author_name"] == nutritionist.name
        assert measurement.json()["weight_kg"] == 72.3
        assert measurement.json()["body_fat_pct"] == 25.1
        assert client.get(f"{base}/measurements", headers=patient_headers).json()["total"] == 1
        assert (
            client.post(
                f"{base}/measurements",
                headers=patient_headers,
                json={"measured_on": date.today().isoformat(), "weight_kg": 70},
            ).status_code
            == 403
        )
        assert (
            client.post(
                f"{base}/measurements",
                headers=first_headers,
                json={
                    "measured_on": (date.today() + timedelta(days=1)).isoformat(),
                    "weight_kg": 70,
                },
            ).status_code
            == 422
        )
        assert client.get(f"{base}/measurements", headers=admin_headers).status_code == 403

        assessment = client.post(
            f"{base}/follow-ups",
            headers=first_headers,
            json={"text": "  Avaliação profissional inicial.  "},
        )
        assert assessment.status_code == 201, assessment.text
        assert assessment.json()["text"] == "Avaliação profissional inicial."
        assert assessment.json()["author_id"] == str(nutritionist.id)
        assert client.get(f"{base}/follow-ups", headers=patient_headers).status_code == 403
        assert client.get(f"{base}/follow-ups", headers=admin_headers).status_code == 403

        transferred = client.put(
            f"{base}/assignment",
            headers=admin_headers,
            json={"nutritionist_id": str(second_nutritionist.id)},
        )
        assert transferred.status_code == 200, transferred.text
        assert client.get(f"{base}/measurements", headers=first_headers).status_code == 403
        assert client.get(f"{base}/follow-ups", headers=first_headers).status_code == 403
        assert client.get(f"{base}/weight-goal", headers=first_headers).status_code == 403
        assert client.get(f"{base}/measurements", headers=second_headers).json()["total"] == 1
        assert client.get(f"{base}/weight-goal", headers=second_headers).json()["target_kg"] == 67.0
        notes = client.get(f"{base}/follow-ups", headers=second_headers)
        assert notes.status_code == 200
        assert notes.json()["items"][0]["author_name"] == nutritionist.name
        assert client.get(f"{base}/measurements", headers=other_headers).status_code == 403

    async with AsyncSessionLocal() as db:
        assert (
            await db.scalar(
                select(func.count())
                .select_from(PatientIntakeRevisionModel)
                .where(PatientIntakeRevisionModel.patient_id == patient.id)
            )
            == 2
        )
        assert (
            await db.scalar(
                select(func.count())
                .select_from(MeasurementModel)
                .where(MeasurementModel.patient_id == patient.id)
            )
            == 1
        )
        assert (
            await db.scalar(
                select(func.count())
                .select_from(WeightGoalRevisionModel)
                .where(WeightGoalRevisionModel.patient_id == patient.id)
            )
            == 2
        )
        assert (
            await db.scalar(
                select(func.count())
                .select_from(FollowUpModel)
                .where(FollowUpModel.patient_id == patient.id)
            )
            == 1
        )
        events = (
            await db.scalars(
                select(AuditEventModel).where(
                    AuditEventModel.action.in_(
                        [
                            "update_intake",
                            "update_weight_goal",
                            "record_measurement",
                            "record_follow_up",
                        ]
                    )
                )
            )
        ).all()
        assert events
        assert all(
            "Avaliação profissional inicial." not in str(event.event_data) for event in events
        )
