"""Run with: uv run python -m app.whatsapp.worker."""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from cryptography.fernet import InvalidToken
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError

from app.care.models import CareAssignmentModel
from app.care.outbox import cipher
from app.care.policies import lock_users, utcnow
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.users.domain.enums import UserRole, UserStatus
from app.whatsapp.models import WhatsAppConnection, WhatsAppContact, WhatsAppEvent, WhatsAppMessage
from app.whatsapp.service import next_status, window_open

logger = logging.getLogger("nutri.whatsapp")


def pilot_connections():
    settings = get_settings()
    return select(WhatsAppConnection.id).where(
        WhatsAppConnection.nutritionist_id == settings.whatsapp_pilot_nutritionist_id,
        WhatsAppConnection.phone_number_id == settings.whatsapp_phone_number_id,
    )


async def process_event() -> bool:
    if not get_settings().whatsapp_enabled:
        return False
    async with AsyncSessionLocal() as db, db.begin():
        event = await db.scalar(
            select(WhatsAppEvent)
            .where(
                WhatsAppEvent.processed_at.is_(None),
                WhatsAppEvent.connection_id.in_(pilot_connections()),
            )
            .order_by(WhatsAppEvent.updated_at, WhatsAppEvent.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not event:
            return False
        try:
            data = json.loads(cipher().decrypt(event.payload.encode()))
        except InvalidToken, ValueError, AttributeError:
            # Keep the encrypted payload for operational recovery; no plaintext in logs.
            logger.error("whatsapp_event_decryption_failed event_id=%s", event.id)
            raise RuntimeError("Não foi possível decifrar um evento do WhatsApp.") from None
        contact = await db.scalar(
            select(WhatsAppContact)
            .where(
                WhatsAppContact.connection_id == event.connection_id,
                WhatsAppContact.phone == data["phone"],
            )
            .with_for_update()
        )
        if contact:
            if data["kind"] == "inbound":
                stamp = datetime.fromisoformat(data["timestamp"])
                await db.execute(
                    insert(WhatsAppMessage)
                    .values(
                        contact_id=contact.id,
                        direction="inbound",
                        text=data["text"],
                        external_id=data["id"],
                        status="received",
                        occurred_at=stamp,
                    )
                    .on_conflict_do_nothing(index_elements=["external_id"])
                )
                if not contact.last_inbound_at or stamp > contact.last_inbound_at:
                    contact.last_inbound_at = stamp
            else:
                message = await db.scalar(
                    select(WhatsAppMessage)
                    .where(
                        WhatsAppMessage.external_id == data["id"],
                        WhatsAppMessage.contact_id == contact.id,
                        WhatsAppMessage.direction == "outbound",
                    )
                    .with_for_update()
                )
                if not message and data.get("local_id"):
                    message = await db.scalar(
                        select(WhatsAppMessage)
                        .where(
                            WhatsAppMessage.id == UUID(data["local_id"]),
                            WhatsAppMessage.contact_id == contact.id,
                            WhatsAppMessage.direction == "outbound",
                        )
                        .with_for_update()
                    )
                    if message and message.external_id not in (None, data["id"]):
                        message = None
                if not message:
                    # The delivery event can precede the HTTP response transaction.
                    # Other outgoing messages (e.g. from a phone) aren't imported in this pilot.
                    if event.created_at > utcnow() - timedelta(minutes=5):
                        event.updated_at = utcnow()
                        return False
                else:
                    message.external_id = data["id"]
                    message.status = next_status(message.status, data["status"])
                    if message.status != "failed":
                        message.error_code = None
        event.processed_at = utcnow()
        event.payload = None
        return True


def send_to_meta(phone: str, text: str, local_id: UUID) -> tuple[str, str | None, str | None]:
    settings = get_settings()
    payload = json.dumps(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {"body": text},
            "biz_opaque_callback_data": str(local_id),
        }
    ).encode()
    request = Request(
        f"https://graph.facebook.com/{settings.whatsapp_graph_version}/"
        f"{settings.whatsapp_phone_number_id}/messages",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.whatsapp_access_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            result = json.loads(response.read(65536))
        external = result["messages"][0]["id"]
        if not isinstance(external, str) or not external or len(external) > 300:
            raise ValueError("invalid_message_id")
        return "sent", external, None
    except HTTPError as error:
        # A 5xx can happen after acceptance. Never automatically resend ambiguous requests.
        return ("failed" if 400 <= error.code < 500 else "unknown", None, f"meta_http_{error.code}")
    except URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError:
        return "unknown", None, "delivery_uncertain"


async def deliver_one() -> bool:
    settings = get_settings()
    if not settings.whatsapp_enabled:
        return False
    contact_ids = select(WhatsAppContact.id).where(
        WhatsAppContact.connection_id.in_(pilot_connections())
    )
    async with AsyncSessionLocal() as db, db.begin():
        # Sending is committed before I/O. Crashes cannot put a message back in the queue.
        await db.execute(
            update(WhatsAppMessage)
            .where(
                WhatsAppMessage.status == "sending",
                WhatsAppMessage.contact_id.in_(contact_ids),
                WhatsAppMessage.updated_at < utcnow() - timedelta(minutes=2),
            )
            .values(status="unknown", error_code="worker_interrupted")
        )
        if not settings.whatsapp_sends_enabled:
            return False
        message = await db.scalar(
            select(WhatsAppMessage)
            .where(WhatsAppMessage.status == "queued", WhatsAppMessage.contact_id.in_(contact_ids))
            .order_by(WhatsAppMessage.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not message:
            return False
        contact = await db.get(WhatsAppContact, message.contact_id)
        connection = await db.get(WhatsAppConnection, contact.connection_id)
        assignment = await db.get(CareAssignmentModel, contact.assignment_id)
        # Same user locks used by assignment changes: recheck permission at actual dispatch.
        users = await lock_users(db, assignment.patient_id, connection.nutritionist_id)
        await db.refresh(assignment)
        await db.refresh(connection)
        valid = (
            connection.active
            and connection.phone_number_id == settings.whatsapp_phone_number_id
            and connection.nutritionist_id == settings.whatsapp_pilot_nutritionist_id
            and not assignment.ended_at
            and assignment.nutritionist_id == connection.nutritionist_id
            and contact.phone in settings.whatsapp_allowed_phones
            and all(
                user_id in users
                and users[user_id].status == UserStatus.ACTIVE
                and not users[user_id].deactivated_at
                for user_id in (assignment.patient_id, connection.nutritionist_id)
            )
            and users[connection.nutritionist_id].role == UserRole.NUTRITIONIST
            and window_open(contact.last_inbound_at)
        )
        if not valid:
            message.status = "failed"
            message.error_code = "dispatch_not_allowed"
            return True
        message.status = "sending"
        message_id, phone, text = message.id, contact.phone, message.text
    status, external_id, error_code = await asyncio.to_thread(send_to_meta, phone, text, message_id)
    async with AsyncSessionLocal() as db, db.begin():
        message = await db.scalar(
            select(WhatsAppMessage).where(WhatsAppMessage.id == message_id).with_for_update()
        )
        message.status = next_status(message.status, status)
        if external_id:
            message.external_id = external_id
        message.error_code = error_code if message.status in ("unknown", "failed") else None
    logger.info("whatsapp_dispatch message_id=%s status=%s", message_id, status)
    return True


async def run_worker():
    while True:
        try:
            if not get_settings().whatsapp_enabled:
                await asyncio.sleep(5)
                continue
            processed = await process_event()
            delivered = await deliver_one()
            if not processed and not delivered:
                await asyncio.sleep(2)
        except (SQLAlchemyError, RuntimeError) as error:
            logger.error("whatsapp_worker_failed exception_type=%s", type(error).__name__)
            await asyncio.sleep(5)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
