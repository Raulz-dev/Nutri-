import os
from datetime import timedelta
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.care.plan_models import MealPlanModel
from app.care.plan_router import local_today
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import AuditEventModel, UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


def plan_content(start, end, title="Plano inicial"):
    return {
        "title": title,
        "start_on": start.isoformat(),
        "end_on": end.isoformat(),
        "water_liters": 2.0,
        "guidance": "Orientação fictícia",
        "meals": [
            {
                "id": str(uuid7()),
                "title": "Almoço",
                "time": "12:30",
                "foods": [{"id": str(uuid7()), "name": "Arroz", "grams": 100}],
                "substitutions": [
                    {
                        "id": str(uuid7()),
                        "foods": [
                            {"id": str(uuid7()), "name": "Batata", "grams": 120},
                            {"id": str(uuid7()), "name": "Frango", "grams": 100},
                        ],
                    }
                ],
                "calories": 400,
                "protein": 30,
                "carbs": 45,
                "fats": 10,
            }
        ],
    }


@pytest.mark.asyncio
async def test_meal_plan_publication_vigency_history_and_access(monkeypatch):
    password = "TestPassword123!"
    password_hash = PasswordHasher().hash(password)
    users = [
        UserModel(
            id=uuid7(),
            name=name,
            email=f"{role.value}-{uuid7()}@example.com",
            password_hash=password_hash,
            role=role,
            status=UserStatus.ACTIVE,
        )
        for name, role in [
            ("Admin Planos", UserRole.ADMIN),
            ("Nutri Planos", UserRole.NUTRITIONIST),
            ("Nutri Sem Vínculo", UserRole.NUTRITIONIST),
            ("Paciente Planos", UserRole.PATIENT),
            ("Outro Paciente", UserRole.PATIENT),
        ]
    ]
    admin, nutritionist, unlinked_nutritionist, patient, other_patient = users
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
        nutritionist_headers = headers(nutritionist)
        unlinked_headers = headers(unlinked_nutritionist)
        patient_headers = headers(patient)
        other_headers = headers(other_patient)
        base = f"/api/v1/patients/{patient.id}"
        assigned = client.put(
            f"{base}/assignment",
            headers=admin_headers,
            json={"nutritionist_id": str(nutritionist.id)},
        )
        assert assigned.status_code == 200, assigned.text

        today = local_today()
        content = plan_content(today, today + timedelta(days=10))
        assert client.get(f"{base}/plans/current", headers=patient_headers).json() is None
        assert client.get(f"{base}/plans", headers=patient_headers).status_code == 403
        assert client.get(f"{base}/plans/current", headers=admin_headers).status_code == 403
        assert client.get(f"{base}/plans/current", headers=other_headers).status_code == 403
        assert client.get(f"{base}/plans", headers=unlinked_headers).status_code == 403
        assert (
            client.post(f"{base}/plans", headers=patient_headers, json=content).status_code == 403
        )

        invalid = plan_content(today, today + timedelta(days=10))
        invalid["meals"][0]["substitutions"][0]["foods"] = []
        assert (
            client.post(f"{base}/plans", headers=nutritionist_headers, json=invalid).status_code
            == 422
        )

        draft = client.post(f"{base}/plans", headers=nutritionist_headers, json=content)
        assert draft.status_code == 201, draft.text
        plan_id = draft.json()["id"]
        assert draft.json()["revision"] == 1
        assert client.get(f"{base}/plans/current", headers=patient_headers).json() is None

        edited = client.put(
            f"{base}/plans/{plan_id}",
            headers=nutritionist_headers,
            json={**content, "title": "Plano revisado", "expected_revision": 1},
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["revision"] == 2
        stale = client.put(
            f"{base}/plans/{plan_id}",
            headers=nutritionist_headers,
            json={**content, "expected_revision": 1},
        )
        assert stale.status_code == 409
        assert (
            client.post(
                f"{base}/plans/{plan_id}/publish",
                headers=nutritionist_headers,
                json={"expected_revision": 1},
            ).status_code
            == 409
        )

        published = client.post(
            f"{base}/plans/{plan_id}/publish",
            headers=nutritionist_headers,
            json={"expected_revision": 2},
        )
        assert published.status_code == 200, published.text
        assert published.json()["revision"] == 3
        assert published.json()["status"] == "published"
        current = client.get(f"{base}/plans/current", headers=patient_headers)
        assert current.status_code == 200
        assert current.json()["id"] == plan_id
        assert current.json()["title"] == "Plano revisado"
        assert len(current.json()["meals"][0]["substitutions"][0]["foods"]) == 2
        assert (
            client.put(
                f"{base}/plans/{plan_id}",
                headers=nutritionist_headers,
                json={**content, "expected_revision": 3},
            ).status_code
            == 409
        )
        assert client.delete(f"{base}/assignment", headers=admin_headers).status_code == 409

        future_start = today + timedelta(days=3)
        future = client.post(
            f"{base}/plans",
            headers=nutritionist_headers,
            json=plan_content(future_start, today + timedelta(days=15), "Plano futuro"),
        )
        assert future.status_code == 201, future.text
        future_id = future.json()["id"]
        future_published = client.post(
            f"{base}/plans/{future_id}/publish",
            headers=nutritionist_headers,
            json={"expected_revision": 1},
        )
        assert future_published.status_code == 200, future_published.text
        assert client.get(f"{base}/plans/current", headers=patient_headers).json()["id"] == plan_id
        history = client.get(f"{base}/plans", headers=nutritionist_headers).json()
        assert history["total"] == 2
        assert {item["id"] for item in history["items"]} == {plan_id, future_id}
        assert (
            next(item for item in history["items"] if item["id"] == plan_id)["effective_end_on"]
            == (future_start - timedelta(days=1)).isoformat()
        )

        monkeypatch.setattr("app.care.plan_router.local_today", lambda: future_start)
        assert (
            client.get(f"{base}/plans/current", headers=patient_headers).json()["id"] == future_id
        )
        monkeypatch.setattr("app.care.plan_router.local_today", lambda: today)

        later_start = today + timedelta(days=5)
        later = client.post(
            f"{base}/plans",
            headers=nutritionist_headers,
            json=plan_content(later_start, today + timedelta(days=18), "Plano futuro substituto"),
        )
        assert later.status_code == 201, later.text
        later_id = later.json()["id"]
        assert (
            client.post(
                f"{base}/plans/{later_id}/publish",
                headers=nutritionist_headers,
                json={"expected_revision": 1},
            ).status_code
            == 200
        )
        monkeypatch.setattr("app.care.plan_router.local_today", lambda: future_start)
        assert client.get(f"{base}/plans/current", headers=patient_headers).json()["id"] == plan_id
        monkeypatch.setattr("app.care.plan_router.local_today", lambda: later_start)
        assert client.get(f"{base}/plans/current", headers=patient_headers).json()["id"] == later_id
        monkeypatch.setattr("app.care.plan_router.local_today", lambda: today)
        replaced = client.get(f"{base}/plans", headers=nutritionist_headers).json()
        assert (
            next(item for item in replaced["items"] if item["id"] == future_id)["status"]
            == "closed"
        )
        assert (
            next(item for item in replaced["items"] if item["id"] == plan_id)["effective_end_on"]
            == (later_start - timedelta(days=1)).isoformat()
        )

        closed_future = client.post(
            f"{base}/plans/{later_id}/close",
            headers=nutritionist_headers,
            json={"expected_revision": 2},
        )
        assert closed_future.status_code == 200, closed_future.text
        assert client.get(f"{base}/plans/current", headers=patient_headers).json()["id"] == plan_id
        restored = client.get(f"{base}/plans", headers=nutritionist_headers).json()
        assert (
            next(item for item in restored["items"] if item["id"] == plan_id)["effective_end_on"]
            == (today + timedelta(days=10)).isoformat()
        )

        current_revision = next(
            item["revision"] for item in restored["items"] if item["id"] == plan_id
        )
        assert (
            client.post(
                f"{base}/plans/{plan_id}/close",
                headers=nutritionist_headers,
                json={"expected_revision": current_revision},
            ).status_code
            == 200
        )
        assert client.get(f"{base}/plans/current", headers=patient_headers).json() is None
        transferred = client.put(
            f"{base}/assignment",
            headers=admin_headers,
            json={"nutritionist_id": str(unlinked_nutritionist.id)},
        )
        assert transferred.status_code == 200, transferred.text
        assert client.get(f"{base}/plans", headers=nutritionist_headers).status_code == 403
        assert client.get(f"{base}/plans", headers=unlinked_headers).json()["total"] == 3

    async with AsyncSessionLocal() as db:
        plans = (
            await db.scalars(select(MealPlanModel).where(MealPlanModel.patient_id == patient.id))
        ).all()
        assert len(plans) == 3
        events = (
            await db.scalars(
                select(AuditEventModel).where(
                    AuditEventModel.entity_type == "meal_plan",
                    AuditEventModel.entity_id.in_([plan.id for plan in plans]),
                )
            )
        ).all()
        assert {event.action for event in events} >= {
            "create_meal_plan",
            "update_meal_plan",
            "publish_meal_plan",
            "close_meal_plan",
        }
        assert all("Batata" not in str(event.event_data) for event in events)
