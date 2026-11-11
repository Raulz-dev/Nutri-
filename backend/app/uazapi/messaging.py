import base64
import binascii
import re
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, StringConstraints, ValidationError
from sqlalchemy import func, or_, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.care.models import CareAssignmentModel
from app.care.policies import audit, current_assignment
from app.database.session import get_db
from app.security.password import PasswordHasher
from app.uazapi.client import UazapiError, chat_avatar, download_media, send_media, send_text
from app.uazapi.limits import MAX_SEND_BODY, MAX_UPLOAD, MAX_UPLOAD_BASE64
from app.uazapi.models import UazapiConversation, UazapiMessage, UazapiReceipt, UazapiSender
from app.uazapi.router import Authorized, OwnedConnection
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel
from app.users.presentation.schemas import Cpf

router = APIRouter(prefix="/whatsapp/uazapi", tags=["WhatsApp UazAPI"])
Db = Annotated[AsyncSession, Depends(get_db, scope="function")]
STATUS_ORDER = {
    "sending": 0,
    "unknown": 1,
    "failed": 2,
    "sent": 3,
    "delivered": 4,
    "read": 5,
    "played": 6,
}


def confirmed_status(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.lower()
    if normalized in ("failed", "canceled", "cancelled"):
        return "failed"
    return normalized if normalized in ("sent", "delivered", "read", "played") else None


def apply_status(row: UazapiMessage, status: str) -> None:
    if STATUS_ORDER[status] >= STATUS_ORDER.get(row.delivery_status, -1):
        row.delivery_status = status


async def record_receipt(
    db: AsyncSession, connection_id: UUID, provider_id: str, rank: int = 0
) -> int:
    # Both paths lock this key before locking a message, even if the receipt arrives first.
    receipt = insert(UazapiReceipt).values(
        connection_id=connection_id, provider_message_id=provider_id, rank=rank
    )
    return await db.scalar(
        receipt.on_conflict_do_update(
            index_elements=[UazapiReceipt.connection_id, UazapiReceipt.provider_message_id],
            set_={"rank": func.greatest(UazapiReceipt.rank, receipt.excluded.rank)},
        ).returning(UazapiReceipt.rank)
    )


def apply_receipt_rank(row: UazapiMessage, rank: int) -> None:
    if rank > 0:
        apply_status(row, next(status for status, value in STATUS_ORDER.items() if value == rank))


class ConversationItem(BaseModel):
    id: UUID
    title: str
    last_message_at: datetime | None


class MessageItem(BaseModel):
    id: UUID
    direction: str
    kind: str
    text: str | None
    occurred_at: datetime
    delivery_status: str | None
    media_available: bool = False


class History(BaseModel):
    items: list[MessageItem]
    next_before: UUID | None
    phone: str | None = None
    patient_id: UUID | None = None


UPLOAD_TYPES = {
    "image/jpeg": ("image", "ImageMessage"),
    "image/png": ("image", "ImageMessage"),
    "image/webp": ("image", "ImageMessage"),
    "image/gif": ("image", "ImageMessage"),
    "audio/ogg": ("audio", "AudioMessage"),
    "audio/opus": ("audio", "AudioMessage"),
    "audio/mpeg": ("audio", "AudioMessage"),
    "audio/mp4": ("audio", "AudioMessage"),
    "audio/aac": ("audio", "AudioMessage"),
    "audio/wav": ("audio", "AudioMessage"),
    "audio/webm": ("audio", "AudioMessage"),
    "application/pdf": ("document", "DocumentMessage"),
}


class Upload(BaseModel):
    name: Annotated[str, StringConstraints(min_length=1, max_length=255, pattern=r"^[^\x00]+$")]
    mime_type: Annotated[str, StringConstraints(max_length=100)]
    base64: Annotated[str, StringConstraints(min_length=1, max_length=MAX_UPLOAD_BASE64)]

    def validate_content(self) -> tuple[str, str, str]:
        media = UPLOAD_TYPES.get(self.mime_type)
        if media is None:
            raise HTTPException(415, "Envie um PDF, áudio ou foto em formato compatível.")
        try:
            content = base64.b64decode(self.base64, validate=True)
        except ValueError, binascii.Error:
            raise HTTPException(422, "Arquivo inválido.") from None
        if not content or (
            self.mime_type == "application/pdf" and not content.startswith(b"%PDF-")
        ):
            raise HTTPException(422, "Arquivo inválido.")
        if len(content) > MAX_UPLOAD:
            raise HTTPException(413, "O arquivo ultrapassa 10 MB.")
        digest = sha256(f"{self.mime_type}\0{self.name}\0".encode())
        digest.update(content)
        return *media, digest.hexdigest()


class SendText(BaseModel):
    request_id: UUID
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=4096, pattern=r"^[^\x00]*$")
    ] = ""
    attachment: Upload | None = None


async def read_send_body(request: Request) -> SendText:
    limit = MAX_SEND_BODY
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(413, "A mensagem excede o tamanho permitido.")
        body.extend(chunk)
    try:
        return SendText.model_validate_json(body)
    except ValidationError:
        raise HTTPException(422, "Confira os dados da mensagem ou do anexo.") from None


SendBody = Annotated[SendText, Depends(read_send_body)]


def message_item(row: UazapiMessage) -> MessageItem:
    status = row.delivery_status
    if status == "sending" and row.occurred_at < datetime.now(UTC) - timedelta(minutes=2):
        status = "unknown"
    return MessageItem(
        id=row.id,
        direction=row.direction,
        kind=row.kind,
        text=row.text,
        occurred_at=row.occurred_at,
        delivery_status=status,
        media_available=row.direction == "inbound" or bool(row.provider_message_id),
    )


async def owned_chat(db: Db, connection_id: UUID, chat_id: UUID) -> UazapiConversation:
    chat = await db.scalar(
        select(UazapiConversation).where(
            UazapiConversation.connection_id == connection_id,
            UazapiConversation.id == chat_id,
        )
    )
    if chat is None:
        raise HTTPException(404, "Conversa não encontrada.")
    return chat


@router.get("/conversations")
async def conversations(
    connection: OwnedConnection,
    db: Db,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ConversationItem]:
    latest = (
        select(
            UazapiMessage.conversation_id,
            func.max(UazapiMessage.occurred_at).label("last_at"),
        )
        .where(UazapiMessage.connection_id == connection.id)
        .group_by(UazapiMessage.conversation_id)
        .subquery()
    )
    rows = await db.execute(
        select(UazapiConversation, latest.c.last_at)
        .outerjoin(latest, latest.c.conversation_id == UazapiConversation.id)
        .where(UazapiConversation.connection_id == connection.id)
        .order_by(latest.c.last_at.desc().nulls_last(), UazapiConversation.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return [
        ConversationItem(id=chat.id, title=chat.title or chat.external_id, last_message_at=last_at)
        for chat, last_at in rows
    ]


def contact_phone(chat: UazapiConversation) -> str | None:
    match = re.fullmatch(r"([1-9][0-9]{7,14})@(?:s\.whatsapp\.net|c\.us)", chat.external_id)
    return f"+{match[1]}" if match else None


async def contact_sender(db: AsyncSession, chat: UazapiConversation) -> UazapiSender | None:
    return await db.scalar(
        select(UazapiSender).where(
            UazapiSender.connection_id == chat.connection_id,
            UazapiSender.external_id == chat.external_id,
        )
    )


class StartConversation(BaseModel):
    patient_id: UUID
    phone: Annotated[str, StringConstraints(pattern=r"^[1-9][0-9]{7,14}$")]


@router.post("/conversations", response_model=ConversationItem)
async def start_conversation(
    data: StartConversation, connection: OwnedConnection, db: Db
) -> ConversationItem:
    assignment = await current_assignment(db, data.patient_id)
    patient = await db.get(UserModel, data.patient_id)
    if (
        not assignment
        or assignment.nutritionist_id != connection.user_id
        or not patient
        or patient.role != UserRole.PATIENT
        or patient.status != UserStatus.ACTIVE
        or patient.deactivated_at
    ):
        raise HTTPException(404, "Paciente vinculado não encontrado.")

    external_id = f"{data.phone}@s.whatsapp.net"
    conversation = insert(UazapiConversation).values(
        connection_id=connection.id, external_id=external_id, title=patient.name
    )
    chat = await db.scalar(
        conversation.on_conflict_do_update(
            constraint="uq_uazapi_conversation_external",
            set_={"title": func.coalesce(UazapiConversation.title, conversation.excluded.title)},
        ).returning(UazapiConversation)
    )
    contact = insert(UazapiSender).values(
        connection_id=connection.id,
        external_id=external_id,
        display_name=patient.name,
        assignment_id=assignment.id,
    )
    sender = await db.scalar(
        contact.on_conflict_do_update(
            constraint="uq_uazapi_sender_external",
            set_={"external_id": contact.excluded.external_id},
        ).returning(UazapiSender)
    )
    locked_assignment = await current_assignment(db, data.patient_id, lock=True)
    if locked_assignment is None or locked_assignment.id != assignment.id:
        raise HTTPException(409, "O vínculo do paciente mudou. Atualize e tente novamente.")
    if sender.assignment_id and sender.assignment_id != assignment.id:
        previous = await db.get(CareAssignmentModel, sender.assignment_id)
        if previous and previous.ended_at is None:
            raise HTTPException(409, "Este número já está associado a outro paciente.")
    sender.assignment_id = assignment.id
    last_at = await db.scalar(
        select(func.max(UazapiMessage.occurred_at)).where(UazapiMessage.conversation_id == chat.id)
    )
    return ConversationItem(id=chat.id, title=chat.title or patient.name, last_message_at=last_at)


class PatientInput(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    email: EmailStr
    cpf: Cpf


class ChatPatient(BaseModel):
    patient_id: UUID


@router.post("/conversations/{chat_id}/patient", response_model=ChatPatient)
async def add_chat_patient(
    chat_id: UUID, data: PatientInput, connection: OwnedConnection, db: Db
) -> ChatPatient:
    chat = await owned_chat(db, connection.id, chat_id)
    if not contact_phone(chat):
        raise HTTPException(422, "A conversa precisa ter um número de WhatsApp identificado.")
    contact = insert(UazapiSender).values(
        connection_id=connection.id,
        external_id=chat.external_id,
        display_name=chat.title,
    )
    sender = await db.scalar(
        contact.on_conflict_do_update(
            constraint="uq_uazapi_sender_external",
            set_={"external_id": contact.excluded.external_id},
        ).returning(UazapiSender)
    )
    if sender.assignment_id:
        previous = await db.get(CareAssignmentModel, sender.assignment_id)
        if (
            previous
            and previous.ended_at is None
            and previous.nutritionist_id == connection.user_id
        ):
            return ChatPatient(patient_id=previous.patient_id)

    email = data.email.lower()
    existing = (
        await db.scalars(
            select(UserModel).where(
                or_(func.lower(UserModel.email) == email, UserModel.cpf == data.cpf)
            )
        )
    ).all()
    if existing:
        patient = existing[0]
        if (
            len(existing) != 1
            or patient.email.lower() != email
            or patient.cpf != data.cpf
            or patient.role != UserRole.PATIENT
            or patient.status != UserStatus.ACTIVE
            or patient.deactivated_at
        ):
            raise HTTPException(409, "Já existe um cadastro com esses dados.")
        assignment = await current_assignment(db, patient.id, lock=True)
        if not assignment or assignment.nutritionist_id != connection.user_id:
            raise HTTPException(
                409, "Paciente já cadastrado. Use o fluxo de convite para vinculá-lo."
            )
    else:
        password_hash = await run_in_threadpool(PasswordHasher().hash, token_urlsafe(32))
        patient = UserModel(
            name=data.name,
            email=email,
            cpf=data.cpf,
            password_hash=password_hash,
            role=UserRole.PATIENT,
            status=UserStatus.ACTIVE,
        )
        db.add(patient)
        try:
            await db.flush()
        except IntegrityError:
            raise HTTPException(409, "Já existe um cadastro com esses dados.") from None
        assignment = CareAssignmentModel(
            patient_id=patient.id, nutritionist_id=connection.user_id, actor_id=connection.user_id
        )
        db.add(assignment)
        await db.flush()
        audit(db, "assign", "care_assignment", assignment.id, patient_id=str(patient.id))
    sender.assignment_id = assignment.id
    audit(db, "uazapi_associate_patient", "uazapi_sender", sender.id)
    return ChatPatient(patient_id=patient.id)


@router.get("/conversations/{chat_id}/avatar")
async def avatar(chat_id: UUID, connection: OwnedConnection, settings: Authorized, db: Db):
    chat = await owned_chat(db, connection.id, chat_id)
    try:
        url = await run_in_threadpool(chat_avatar, settings, chat.external_id)
    except UazapiError:
        url = None
    return {"url": url}


@router.get("/conversations/{chat_id}/messages")
async def history(
    chat_id: UUID,
    connection: OwnedConnection,
    db: Db,
    before: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> History:
    chat = await owned_chat(db, connection.id, chat_id)
    phone = contact_phone(chat) if before is None else None
    patient_id = None
    if phone:
        sender = await contact_sender(db, chat)
        if sender and sender.assignment_id:
            assignment = await db.get(CareAssignmentModel, sender.assignment_id)
            if (
                assignment
                and assignment.ended_at is None
                and assignment.nutritionist_id == connection.user_id
            ):
                patient_id = assignment.patient_id
    scoped = select(UazapiMessage).where(
        UazapiMessage.connection_id == connection.id, UazapiMessage.conversation_id == chat_id
    )
    query = scoped.order_by(UazapiMessage.occurred_at.desc(), UazapiMessage.id.desc())
    if before:
        cursor = await db.scalar(scoped.where(UazapiMessage.id == before))
        if cursor is None:
            raise HTTPException(404, "Mensagem não encontrada.")
        query = query.where(
            tuple_(UazapiMessage.occurred_at, UazapiMessage.id) < (cursor.occurred_at, cursor.id)
        )
    rows = (await db.scalars(query.limit(limit + 1))).all()
    page = rows[:limit]
    return History(
        items=[message_item(row) for row in reversed(page)],
        next_before=page[-1].id if len(rows) > limit else None,
        phone=phone,
        patient_id=patient_id,
    )


@router.post("/conversations/{chat_id}/messages")
async def send(
    chat_id: UUID, connection: OwnedConnection, settings: Authorized, db: Db, body: SendBody
) -> MessageItem:
    chat = await owned_chat(db, connection.id, chat_id)
    if not body.text and not body.attachment:
        raise HTTPException(422, "Escreva uma mensagem ou escolha um arquivo.")
    media_type, kind, digest = (
        body.attachment.validate_content() if body.attachment else (None, "Conversation", None)
    )
    if media_type == "audio" and body.text:
        raise HTTPException(422, "Envie o áudio e o texto em mensagens separadas.")
    sender = insert(UazapiSender).values(
        connection_id=connection.id, external_id=f"instance:{connection.id}"
    )
    sender_id = await db.scalar(
        sender.on_conflict_do_update(
            constraint="uq_uazapi_sender_external",
            set_={"external_id": sender.excluded.external_id},
        ).returning(UazapiSender.id)
    )
    # Reserve the request before making the external call. Retries only read this row.
    external_id = f"local:{body.request_id}"
    row = await db.scalar(
        insert(UazapiMessage)
        .values(
            connection_id=connection.id,
            conversation_id=chat.id,
            sender_id=sender_id,
            external_id=external_id,
            direction="outbound",
            kind=kind,
            text=body.text,
            attachment_digest=digest,
            occurred_at=datetime.now(UTC),
            delivery_status="sending",
        )
        .on_conflict_do_nothing(constraint="uq_uazapi_message_external")
        .returning(UazapiMessage)
    )
    if row is None:
        previous = await db.scalar(
            select(UazapiMessage).where(
                UazapiMessage.connection_id == connection.id,
                UazapiMessage.external_id == external_id,
            )
        )
        if (
            previous is None
            or previous.conversation_id != chat.id
            or previous.text != body.text
            or previous.attachment_digest != digest
        ):
            raise HTTPException(409, "Identificador já usado em outro envio.")
        return message_item(previous)
    destination = chat.external_id
    await db.commit()

    provider_id = None
    try:
        if body.attachment:
            result = await run_in_threadpool(
                send_media,
                settings,
                destination,
                media_type,
                body.attachment.mime_type,
                body.attachment.base64,
                body.attachment.name,
                body.text,
                str(row.id),
            )
        else:
            result = await run_in_threadpool(
                send_text, settings, destination, body.text, str(row.id)
            )
        raw_id = result.get("messageid")
        if (
            isinstance(raw_id, str)
            and 0 < len(raw_id) <= 300
            and not any(char.isspace() or char == "\x00" for char in raw_id)
        ):
            provider_id = raw_id
        status = confirmed_status(result.get("status"))
        if not status:
            status = "unknown"
    except UazapiError as error:
        status = "failed" if error.code in ("rejected", "invalid_credentials") else "unknown"

    rank = await record_receipt(db, connection.id, provider_id) if provider_id else 0
    latest = await db.get(UazapiMessage, row.id, populate_existing=True, with_for_update=True)
    if provider_id and latest.provider_message_id in (None, provider_id):
        latest.provider_message_id = provider_id
        apply_receipt_rank(latest, rank)
    apply_status(latest, status)
    return message_item(latest)


@router.get("/conversations/{chat_id}/messages/{message_id}/media")
async def media(
    chat_id: UUID,
    message_id: UUID,
    connection: OwnedConnection,
    settings: Authorized,
    db: Db,
) -> dict[str, str]:
    row = await db.scalar(
        select(UazapiMessage).where(
            UazapiMessage.connection_id == connection.id,
            UazapiMessage.conversation_id == chat_id,
            UazapiMessage.id == message_id,
        )
    )
    if row is None or row.kind.lower() not in {
        "image",
        "imagemessage",
        "audio",
        "audiomessage",
        "ptt",
        "pttmessage",
        "document",
        "documentmessage",
        "documentwithcaptionmessage",
    }:
        raise HTTPException(404, "Anexo não encontrado.")
    try:
        external_id = row.provider_message_id if row.direction == "outbound" else row.external_id
        if not external_id:
            raise HTTPException(404, "Anexo ainda indisponível.")
        result = await run_in_threadpool(download_media, settings, external_id)
    except UazapiError as error:
        if error.code == "unsupported_media":
            raise HTTPException(415, "Formato de anexo indisponível.") from None
        if error.code == "media_too_large":
            raise HTTPException(413, "O anexo ultrapassa 20 MB.") from None
        raise HTTPException(502, "Não foi possível baixar o anexo do WhatsApp.") from None
    return result
