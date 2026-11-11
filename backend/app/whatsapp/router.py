import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.models import CareAssignmentModel
from app.care.outbox import cipher
from app.care.policies import audit, clinical_writer, utcnow
from app.config.settings import get_settings
from app.database.session import get_db
from app.users.domain.enums import UserRole
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.presentation.dependencies import get_current_user
from app.whatsapp.models import WhatsAppConnection, WhatsAppContact, WhatsAppEvent, WhatsAppMessage
from app.whatsapp.service import valid_signature, window_open

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp piloto"])
Db = Annotated[AsyncSession, Depends(get_db, scope="function")]
Actor = Annotated[User, Depends(get_current_user)]


class ContactInput(BaseModel):
    patient_id: UUID
    phone: str = Field(pattern=r"^[1-9]\d{7,14}$")


class MessageInput(BaseModel):
    id: UUID
    text: str = Field(min_length=1, max_length=4096)


class ReadInput(BaseModel):
    ids: list[UUID] = Field(max_length=100)


class MessageOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    direction: str
    text: str
    status: str
    occurred_at: datetime
    read_at: datetime | None
    error_code: str | None


async def pilot_actor(actor: Actor) -> User:
    settings = get_settings()
    if (
        actor.role != UserRole.NUTRITIONIST
        or not settings.whatsapp_enabled
        or actor.id != settings.whatsapp_pilot_nutritionist_id
    ):
        raise HTTPException(403, "WhatsApp indisponível para esta conta.")
    return actor


Pilot = Annotated[User, Depends(pilot_actor)]


async def connection_for(db: AsyncSession, actor: User) -> WhatsAppConnection:
    row = await db.scalar(
        select(WhatsAppConnection).where(WhatsAppConnection.nutritionist_id == actor.id)
    )
    if not row:
        raise HTTPException(409, "Conexão do piloto ainda não configurada.")
    return row


async def contact_for(db: AsyncSession, actor: User, contact_id: UUID) -> WhatsAppContact:
    row = await db.scalar(
        select(WhatsAppContact)
        .join(WhatsAppConnection)
        .where(WhatsAppContact.id == contact_id, WhatsAppConnection.nutritionist_id == actor.id)
    )
    if not row:
        raise HTTPException(404, "Contato não encontrado.")
    return row


@router.get("/availability")
async def availability(actor: Actor):
    settings = get_settings()
    return {
        "enabled": settings.whatsapp_enabled
        and actor.role == UserRole.NUTRITIONIST
        and actor.id == settings.whatsapp_pilot_nutritionist_id
    }


@router.get("/connection")
async def connection(actor: Pilot, db: Db):
    row = await db.scalar(
        select(WhatsAppConnection).where(WhatsAppConnection.nutritionist_id == actor.id)
    )
    return {
        "configured": row is not None,
        "active": bool(row and row.active),
        "sends_enabled": bool(row and row.active and get_settings().whatsapp_sends_enabled),
    }


@router.post("/contacts", status_code=201)
async def associate_contact(data: ContactInput, actor: Pilot, db: Db):
    await clinical_writer(db, actor, data.patient_id)
    row = await connection_for(db, actor)
    if not row.active or data.phone not in get_settings().whatsapp_allowed_phones:
        raise HTTPException(422, "Número não autorizado no piloto ou conexão desativada.")
    assignment = await db.scalar(
        select(CareAssignmentModel).where(
            CareAssignmentModel.patient_id == data.patient_id,
            CareAssignmentModel.nutritionist_id == actor.id,
            CareAssignmentModel.ended_at.is_(None),
        )
    )
    existing = await db.scalar(
        select(WhatsAppContact).where(WhatsAppContact.assignment_id == assignment.id)
    )
    if existing:
        if existing.phone != data.phone:
            raise HTTPException(409, "O vínculo já possui outro número associado.")
        return {"id": existing.id}
    contact = WhatsAppContact(connection_id=row.id, assignment_id=assignment.id, phone=data.phone)
    db.add(contact)
    try:
        await db.flush()
    except IntegrityError as error:
        raise HTTPException(
            409, "Número já associado a outro paciente deste profissional."
        ) from error
    audit(db, "whatsapp_associate_contact", "whatsapp_contact", contact.id)
    return {"id": contact.id}


@router.get("/contacts")
async def contacts(
    actor: Pilot, db: Db, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)
):
    query = (
        select(WhatsAppContact, CareAssignmentModel, UserModel.name)
        .join(WhatsAppConnection, WhatsAppConnection.id == WhatsAppContact.connection_id)
        .join(CareAssignmentModel, CareAssignmentModel.id == WhatsAppContact.assignment_id)
        .join(UserModel, UserModel.id == CareAssignmentModel.patient_id)
        .where(WhatsAppConnection.nutritionist_id == actor.id)
    )
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await db.execute(
            query.order_by(WhatsAppContact.created_at, WhatsAppContact.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    result = []
    for contact, assignment, name in rows:
        unread = await db.scalar(
            select(func.count())
            .select_from(WhatsAppMessage)
            .where(
                WhatsAppMessage.contact_id == contact.id,
                WhatsAppMessage.direction == "inbound",
                WhatsAppMessage.read_at.is_(None),
            )
        )
        result.append(
            {
                "id": contact.id,
                "patient_id": assignment.patient_id,
                "patient_name": name,
                "phone": contact.phone,
                "active": assignment.ended_at is None,
                "window_open": window_open(contact.last_inbound_at),
                "unread": unread,
            }
        )
    return {"items": result, "total": total, "offset": offset, "limit": limit}


@router.get("/contacts/{contact_id}/messages")
async def messages(
    contact_id: UUID,
    actor: Pilot,
    db: Db,
    before: UUID | None = None,
    limit: int = Query(50, ge=1, le=100),
):
    await contact_for(db, actor, contact_id)
    query = select(WhatsAppMessage).where(WhatsAppMessage.contact_id == contact_id)
    # Paginate by insertion time, not by untrusted client UUIDs or delayed Meta timestamps.
    if before:
        anchor = await db.get(WhatsAppMessage, before)
        if not anchor or anchor.contact_id != contact_id:
            raise HTTPException(422, "Cursor inválido.")
        query = query.where(
            tuple_(WhatsAppMessage.created_at, WhatsAppMessage.id) < (anchor.created_at, anchor.id)
        )
    rows = (
        await db.scalars(
            query.order_by(WhatsAppMessage.created_at.desc(), WhatsAppMessage.id.desc()).limit(
                limit + 1
            )
        )
    ).all()
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "items": [MessageOutput.model_validate(row) for row in rows],
        "next_cursor": str(rows[-1].id) if more else None,
    }


@router.post("/contacts/{contact_id}/messages", response_model=MessageOutput, status_code=201)
async def send(contact_id: UUID, data: MessageInput, actor: Pilot, db: Db):
    contact = await contact_for(db, actor, contact_id)
    assignment = await db.get(CareAssignmentModel, contact.assignment_id)
    await clinical_writer(db, actor, assignment.patient_id)
    # Also check this exact assignment: a later reassignment must not reopen old conversations.
    if assignment.ended_at:
        raise HTTPException(409, "Vínculo encerrado. Histórico disponível apenas para leitura.")
    text = data.text.strip()
    if not text:
        raise HTTPException(422, "Escreva uma mensagem.")
    existing = await db.get(WhatsAppMessage, data.id)
    if existing:
        if (
            existing.contact_id != contact.id
            or existing.text != text
            or existing.direction != "outbound"
        ):
            raise HTTPException(409, "Identificador de mensagem já utilizado.")
        return existing
    connection = await connection_for(db, actor)
    if not connection.active or not get_settings().whatsapp_sends_enabled:
        raise HTTPException(409, "Envios de WhatsApp pausados.")
    if contact.phone not in get_settings().whatsapp_allowed_phones:
        raise HTTPException(409, "Contato removido do piloto.")
    if not window_open(contact.last_inbound_at):
        raise HTTPException(
            409, "Janela de atendimento encerrada. Aguarde uma mensagem do paciente."
        )
    message = WhatsAppMessage(
        id=data.id,
        contact_id=contact.id,
        direction="outbound",
        text=text,
        status="queued",
        occurred_at=utcnow(),
    )
    db.add(message)
    try:
        await db.flush()
    except IntegrityError as error:
        raise HTTPException(409, "Identificador já recebido. Atualize o histórico.") from error
    audit(db, "whatsapp_queue_message", "whatsapp_message", message.id)
    return message


@router.post("/contacts/{contact_id}/read", status_code=204)
async def read(contact_id: UUID, data: ReadInput, actor: Pilot, db: Db):
    await contact_for(db, actor, contact_id)
    await db.execute(
        update(WhatsAppMessage)
        .where(
            WhatsAppMessage.contact_id == contact_id,
            WhatsAppMessage.id.in_(data.ids),
            WhatsAppMessage.direction == "inbound",
            WhatsAppMessage.read_at.is_(None),
        )
        .values(read_at=utcnow())
    )


class WebhookValue(BaseModel):
    metadata: dict = Field(default_factory=dict)
    messages: list[dict] = Field(default_factory=list)
    statuses: list[dict] = Field(default_factory=list)


class WebhookChange(BaseModel):
    value: WebhookValue


class WebhookEntry(BaseModel):
    changes: list[WebhookChange] = Field(default_factory=list)


class WebhookBody(BaseModel):
    object: str
    entry: list[WebhookEntry] = Field(default_factory=list)


@router.get("/webhook", response_class=PlainTextResponse)
async def verify(request: Request):
    settings = get_settings()
    params = request.query_params
    if (
        not settings.whatsapp_enabled
        or params.get("hub.mode") != "subscribe"
        or not settings.whatsapp_verify_token
        or not hmac.compare_digest(
            params.get("hub.verify_token", "").encode(), settings.whatsapp_verify_token.encode()
        )
    ):
        raise HTTPException(403, "Verificação inválida.")
    return params.get("hub.challenge", "")


@router.post("/webhook")
async def webhook(request: Request, db: Db):
    settings = get_settings()
    body = await request.body()
    if not settings.whatsapp_enabled:
        raise HTTPException(503, "Piloto indisponível.")
    if not valid_signature(
        body, request.headers.get("x-hub-signature-256", ""), settings.whatsapp_app_secret
    ):
        raise HTTPException(403, "Assinatura inválida.")
    try:
        envelope = WebhookBody.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(400, "Evento inválido.") from error
    if envelope.object != "whatsapp_business_account":
        return {"received": True}
    connection = await db.scalar(
        select(WhatsAppConnection).where(
            WhatsAppConnection.phone_number_id == settings.whatsapp_phone_number_id,
            WhatsAppConnection.nutritionist_id == settings.whatsapp_pilot_nutritionist_id,
            WhatsAppConnection.active.is_(True),
        )
    )
    if not connection:
        raise HTTPException(503, "Conexão não configurada.")
    for entry in envelope.entry:
        for change in entry.changes:
            value = change.value
            if value.metadata.get("phone_number_id") != connection.phone_number_id:
                continue
            for kind, events in (("inbound", value.messages), ("status", value.statuses)):
                for event in events:
                    normalized = normalize_event(kind, event)
                    if normalized is None:
                        continue
                    phone = normalized["phone"]
                    if phone not in settings.whatsapp_allowed_phones:
                        continue
                    known = await db.scalar(
                        select(WhatsAppContact.id).where(
                            WhatsAppContact.connection_id == connection.id,
                            WhatsAppContact.phone == phone,
                        )
                    )
                    if not known:
                        continue
                    raw = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
                    identity = (
                        connection.phone_number_id + ":" + normalized["id"]
                        if kind == "inbound"
                        else connection.phone_number_id + raw
                    )
                    await db.execute(
                        insert(WhatsAppEvent)
                        .values(
                            connection_id=connection.id,
                            event_key=hashlib.sha256(identity.encode()).hexdigest(),
                            payload=cipher().encrypt(raw.encode()).decode(),
                        )
                        .on_conflict_do_nothing(index_elements=["event_key"])
                    )
    return {"received": True}


def normalize_event(kind: str, event: dict) -> dict | None:
    external = event.get("id")
    phone = event.get("from" if kind == "inbound" else "recipient_id")
    if (
        not isinstance(external, str)
        or not external
        or len(external) > 300
        or not isinstance(phone, str)
    ):
        return None
    try:
        stamp = datetime.fromtimestamp(int(event.get("timestamp", "")), UTC)
    except ValueError, TypeError, OverflowError, OSError:
        return None
    if stamp > utcnow():
        return None
    result = {"kind": kind, "id": external, "phone": phone, "timestamp": stamp.isoformat()}
    if kind == "inbound":
        content = event.get("text")
        if event.get("type") != "text" or not isinstance(content, dict):
            return None
        text = content.get("body")
        if not isinstance(text, str) or not text.strip() or len(text) > 4096:
            return None
        result["text"] = text
    else:
        status = event.get("status")
        if status not in ("sent", "delivered", "read", "failed"):
            return None
        result["status"] = status
        callback = event.get("biz_opaque_callback_data")
        if isinstance(callback, str):
            try:
                result["local_id"] = str(UUID(callback))
            except ValueError:
                pass
    return result
