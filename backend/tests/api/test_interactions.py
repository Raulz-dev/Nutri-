import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid7

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.care.interaction_models import CareMessageModel
from app.care.models import CareAssignmentModel
from app.care.plan_router import local_today
from app.database.session import AsyncSessionLocal
from app.main import app
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import AuditEventModel, UserModel

pytestmark = pytest.mark.skipif(
    not os.environ.get("CARE_TEST_DATABASE_URL"), reason="isolated PostgreSQL required"
)


@pytest.mark.asyncio
async def test_appointments_messages_access_history_and_replay():
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
            ("Admin Interações", UserRole.ADMIN),
            ("Nutri Interações", UserRole.NUTRITIONIST),
            ("Paciente Interações", UserRole.PATIENT),
            ("Outro Paciente", UserRole.PATIENT),
        ]
    ]
    admin, nutritionist, patient, other_patient = users
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
        patient_headers = headers(patient)
        other_headers = headers(other_patient)
        for linked_patient in (patient, other_patient):
            assigned = client.put(
                f"/api/v1/patients/{linked_patient.id}/assignment",
                headers=admin_headers,
                json={"nutritionist_id": str(nutritionist.id)},
            )
            assert assigned.status_code == 200, assigned.text

        appointment_id = str(uuid7())
        appointment_data = {
            "id": appointment_id,
            "patient_id": str(patient.id),
            "appointment_on": (local_today() + timedelta(days=7)).isoformat(),
            "appointment_at": "09:00",
            "format": "Presencial",
            "location": "Consultório de teste",
            "guidance": "Orientação fictícia",
        }
        created = client.post(
            "/api/v1/appointments", headers=nutritionist_headers, json=appointment_data
        )
        assert created.status_code == 201, created.text
        assert created.json()["revision"] == 1
        assert (
            client.post(
                "/api/v1/appointments", headers=nutritionist_headers, json=appointment_data
            ).json()["id"]
            == appointment_id
        )
        assert (
            client.post(
                "/api/v1/appointments",
                headers=patient_headers,
                json={**appointment_data, "id": str(uuid7())},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/v1/appointments",
                headers=nutritionist_headers,
                json={**appointment_data, "id": str(uuid7()), "patient_id": str(other_patient.id)},
            ).status_code
            == 409
        )
        assert client.get("/api/v1/appointments", headers=patient_headers).json()["total"] == 1

        assert (
            client.get("/api/v1/appointments?upcoming=true", headers=nutritionist_headers).json()[
                "total"
            ]
            == 1
        )
        assert client.get("/api/v1/appointments", headers=other_headers).json()["total"] == 0
        assert (
            client.get("/api/v1/appointments/next", headers=patient_headers).json()["id"]
            == appointment_id
        )
        assert (
            client.get("/api/v1/appointments/next", headers=nutritionist_headers).status_code == 403
        )
        assert (
            client.delete(
                f"/api/v1/patients/{patient.id}/assignment", headers=admin_headers
            ).status_code
            == 409
        )

        updated = client.put(
            f"/api/v1/appointments/{appointment_id}",
            headers=nutritionist_headers,
            json={
                **{key: value for key, value in appointment_data.items() if key != "id"},
                "appointment_at": "10:00",
                "expected_revision": 1,
            },
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["revision"] == 2
        assert (
            client.put(
                f"/api/v1/appointments/{appointment_id}",
                headers=nutritionist_headers,
                json={
                    **{key: value for key, value in appointment_data.items() if key != "id"},
                    "expected_revision": 1,
                },
            ).status_code
            == 409
        )

        async with AsyncSessionLocal() as db:
            assignment = await db.scalar(
                select(CareAssignmentModel).where(
                    CareAssignmentModel.patient_id == patient.id,
                    CareAssignmentModel.ended_at.is_(None),
                )
            )
            conversation_id = str(assignment.id)

        conversations = client.get("/api/v1/conversations", headers=patient_headers).json()
        assert conversations["total"] == 1
        assert any(
            item["id"] == conversation_id and item["active"] for item in conversations["items"]
        )
        assert (
            client.get(
                f"/api/v1/conversations/{conversation_id}/messages", headers=other_headers
            ).status_code
            == 404
        )
        message_id = str(uuid7())
        message = {"id": message_id, "text": "Mensagem de teste"}
        sent = client.post(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers=patient_headers,
            json=message,
        )
        assert sent.status_code == 201, sent.text
        assert (
            client.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                headers=patient_headers,
                json=message,
            ).json()["id"]
            == message_id
        )
        assert (
            client.get(
                f"/api/v1/conversations/{conversation_id}/messages",
                headers=nutritionist_headers,
            ).json()["total"]
            == 1
        )
        assert (
            client.post(
                f"/api/v1/conversations/{conversation_id}/read",
                headers=nutritionist_headers,
                json={"ids": [message_id]},
            ).status_code
            == 204
        )
        assert (
            next(
                item
                for item in client.get(
                    "/api/v1/conversations", headers=nutritionist_headers
                ).json()["items"]
                if item["id"] == conversation_id
            )["unread"]
            == 0
        )

        async with AsyncSessionLocal() as db, db.begin():
            db.add_all(
                CareMessageModel(
                    id=uuid7(),
                    assignment_id=UUID(conversation_id),
                    sender_id=patient.id,
                    text=f"Mensagem {index}",
                    sent_at=datetime.now(UTC) + timedelta(seconds=index),
                )
                for index in range(55)
            )
        first_page = client.get(
            f"/api/v1/conversations/{conversation_id}/messages", headers=nutritionist_headers
        ).json()
        assert len(first_page["items"]) == 50
        assert first_page["next_cursor"] is not None
        read_ids = [item["id"] for item in first_page["items"]]
        assert (
            client.post(
                f"/api/v1/conversations/{conversation_id}/read",
                headers=nutritionist_headers,
                json={"ids": read_ids},
            ).status_code
            == 204
        )
        assert (
            client.get("/api/v1/conversations", headers=nutritionist_headers).json()["items"][0][
                "unread"
            ]
            == 5
        )
        new_message = client.post(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers=patient_headers,
            json={"id": str(uuid7()), "text": "Mensagem após a primeira página"},
        )
        assert new_message.status_code == 201, new_message.text
        async with AsyncSessionLocal() as db, db.begin():
            inserted = await db.get(CareMessageModel, UUID(new_message.json()["id"]))
            inserted.sent_at = datetime.now(UTC) + timedelta(minutes=2)
        older = client.get(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers=nutritionist_headers,
            params={
                "before_sent_at": first_page["next_cursor"]["sent_at"],
                "before_id": first_page["next_cursor"]["id"],
            },
        ).json()
        assert len(older["items"]) == 6
        assert not ({item["id"] for item in older["items"]} & set(read_ids))
        assert older["next_cursor"] is None
        assert (
            client.get("/api/v1/conversations", headers=nutritionist_headers).json()["items"][0][
                "unread"
            ]
            == 6
        )

        cancelled = client.post(
            f"/api/v1/appointments/{appointment_id}/status",
            headers=nutritionist_headers,
            json={"status": "cancelled", "expected_revision": 2},
        )
        assert cancelled.status_code == 200, cancelled.text
        assert client.get("/api/v1/appointments/next", headers=patient_headers).json() is None
        assert (
            client.get("/api/v1/appointments?upcoming=true", headers=nutritionist_headers).json()[
                "total"
            ]
            == 0
        )
        assert (
            client.delete(
                f"/api/v1/patients/{patient.id}/assignment", headers=admin_headers
            ).status_code
            == 204
        )
        assert (
            client.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                headers=patient_headers,
                json={"id": str(uuid7()), "text": "Depois do vínculo"},
            ).status_code
            == 409
        )
        assert (
            client.get(
                f"/api/v1/conversations/{conversation_id}/messages", headers=patient_headers
            ).json()["total"]
            == 57
        )
        assert client.get("/api/v1/appointments", headers=patient_headers).json()["total"] == 1

        async with AsyncSessionLocal() as db, db.begin():
            db.add_all(
                CareAssignmentModel(
                    id=uuid7(),
                    patient_id=patient.id,
                    nutritionist_id=nutritionist.id,
                    actor_id=admin.id,
                    started_at=datetime.now(UTC),
                    ended_at=datetime.now(UTC),
                )
                for _ in range(101)
            )
        last_page = client.get("/api/v1/conversations?offset=100&limit=2", headers=patient_headers)
        assert last_page.status_code == 200, last_page.text
        assert last_page.json()["total"] == 102
        assert len(last_page.json()["items"]) == 2

    async with AsyncSessionLocal() as db:
        events = (
            await db.scalars(
                select(AuditEventModel).where(
                    AuditEventModel.entity_type == "care_message",
                    AuditEventModel.entity_id == UUID(message_id),
                )
            )
        ).all()
        assert events
        assert all("Mensagem de teste" not in str(event.event_data) for event in events)
