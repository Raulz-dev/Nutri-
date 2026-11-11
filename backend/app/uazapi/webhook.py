from datetime import UTC, datetime, timedelta
from hmac import compare_digest
from typing import Annotated, Any
from uuid import UUID

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, SecretStr, StringConstraints, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.outbox import cipher
from app.database.session import get_db
from app.uazapi.messaging import (
    STATUS_ORDER,
    apply_receipt_rank,
    apply_status,
    confirmed_status,
    record_receipt,
)
from app.uazapi.models import UazapiConnection, UazapiConversation, UazapiMessage, UazapiSender
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel

router = APIRouter(prefix="/whatsapp/uazapi", tags=["WhatsApp UazAPI"])
MAX_WEBHOOK_BYTES = 1_048_576
ExternalId = Annotated[
    str, StringConstraints(min_length=1, max_length=300, pattern=r"^[^\s\x00]+$")
]
MESSAGE_ID = TypeAdapter(ExternalId)
Name = Annotated[str, StringConstraints(max_length=255, pattern=r"^[^\x00]*$")]


class Envelope(BaseModel, strict=True):
    event_type: str = Field(alias="EventType", min_length=1, max_length=50)
    token: SecretStr = Field(min_length=1, max_length=4096)
    message: Any = None
    event: Any = None
    state: str | None = None


class IncomingMessage(BaseModel, strict=True):
    message_id: ExternalId = Field(alias="messageid")
    chat_id: ExternalId = Field(alias="chatid")
    sender: ExternalId
    sender_name: Name | None = Field(default=None, alias="senderName")
    from_me: bool = Field(alias="fromMe")
    kind: Annotated[str, StringConstraints(min_length=1, max_length=50, pattern=r"^[^\x00]+$")] = (
        Field(alias="messageType")
    )
    text: Annotated[str, StringConstraints(pattern=r"^[^\x00]*$")] | None = None
    timestamp: int = Field(alias="messageTimestamp", ge=0, le=253402300799999)


async def read_envelope(request: Request) -> Envelope:
    if (
        request.headers.get("content-type", "").partition(";")[0].strip().lower()
        != "application/json"
    ):
        raise HTTPException(415, "Envie JSON.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_WEBHOOK_BYTES:
            raise HTTPException(413, "Evento excede o tamanho permitido.")
        body.extend(chunk)
    try:
        return Envelope.model_validate_json(body)
    except ValidationError:
        raise HTTPException(400, "Evento inválido.") from None


async def authorize(db: AsyncSession, connection_id: UUID, token: SecretStr) -> None:
    row = await db.scalar(
        select(UazapiConnection)
        .join(UserModel, UserModel.id == UazapiConnection.user_id)
        .where(
            UazapiConnection.id == connection_id,
            UserModel.role == UserRole.NUTRITIONIST,
            UserModel.status == UserStatus.ACTIVE,
            UserModel.deactivated_at.is_(None),
        )
        .with_for_update(read=True, of=(UazapiConnection, UserModel))
    )
    if row and row.base_url and row.encrypted_token:
        try:
            expected = cipher().decrypt(row.encrypted_token.encode())
        except InvalidToken, RuntimeError:
            raise HTTPException(503, "Conexão indisponível.") from None
        if compare_digest(expected, token.get_secret_value().encode()):
            return
    raise HTTPException(401, "Credencial inválida.")


async def store_message(db: AsyncSession, connection_id: UUID, message: IncomingMessage) -> None:
    # Return on replay before touching conversation or sender rows.
    if await db.scalar(
        select(UazapiMessage.id).where(
            UazapiMessage.connection_id == connection_id,
            UazapiMessage.external_id == message.message_id,
        )
    ):
        return
    # The constraint also handles concurrent deliveries that both miss the lookup above.
    # Roll back any new conversation/sender when this delivery loses that race.
    async with db.begin_nested() as savepoint:
        conversation = insert(UazapiConversation).values(
            connection_id=connection_id,
            external_id=message.chat_id,
            title=message.sender_name if message.chat_id == message.sender else None,
        )
        conversation_id = await db.scalar(
            conversation.on_conflict_do_update(
                constraint="uq_uazapi_conversation_external",
                set_={
                    "title": func.coalesce(UazapiConversation.title, conversation.excluded.title)
                },
            ).returning(UazapiConversation.id)
        )
        sender = insert(UazapiSender).values(
            connection_id=connection_id,
            external_id=message.sender,
            display_name=message.sender_name,
        )
        sender_id = await db.scalar(
            sender.on_conflict_do_update(
                constraint="uq_uazapi_sender_external",
                set_={"external_id": sender.excluded.external_id},
            ).returning(UazapiSender.id)
        )
        result = await db.scalar(
            insert(UazapiMessage)
            .values(
                connection_id=connection_id,
                conversation_id=conversation_id,
                sender_id=sender_id,
                external_id=message.message_id,
                direction="inbound",
                kind=message.kind,
                text=message.text,
                occurred_at=datetime(1970, 1, 1, tzinfo=UTC)
                + timedelta(milliseconds=message.timestamp),
            )
            .on_conflict_do_nothing(constraint="uq_uazapi_message_external")
            .returning(UazapiMessage.id)
        )
        if result is None:
            await savepoint.rollback()


async def reconcile_echo(db: AsyncSession, connection_id: UUID, message: dict) -> None:
    track_id = message.get("track_id")
    if message.get("track_source") != "mais-saude" or not isinstance(track_id, str):
        return
    try:
        row_id = UUID(track_id)
        message_id = MESSAGE_ID.validate_python(message.get("messageid"))
    except ValueError, ValidationError:
        return
    rank = await record_receipt(db, connection_id, message_id)
    row = await db.scalar(
        select(UazapiMessage)
        .where(
            UazapiMessage.id == row_id,
            UazapiMessage.connection_id == connection_id,
            UazapiMessage.direction == "outbound",
        )
        .with_for_update()
    )
    if row is not None and row.provider_message_id in (None, message_id):
        row.provider_message_id = message_id
        apply_receipt_rank(row, rank)
        status = confirmed_status(message.get("status"))
        if status:
            apply_status(row, status)


class Receipt(BaseModel, strict=True):
    ids: list[ExternalId] = Field(alias="MessageIDs", max_length=1000)
    from_me: bool = Field(alias="IsFromMe")


async def apply_receipt(db: AsyncSession, connection_id: UUID, envelope: Envelope) -> None:
    if not isinstance(envelope.event, dict):
        return
    status = confirmed_status(envelope.state or envelope.event.get("Type"))
    if envelope.event.get("Type") == "GroupReceipts":
        receipts = envelope.event.get("Receipts")
        if isinstance(receipts, list):
            statuses = [
                confirmed_status(receipt.get("state"))
                for receipt in receipts
                if isinstance(receipt, dict)
            ]
            status = max(
                (value for value in statuses if value in ("delivered", "read", "played")),
                key=STATUS_ORDER.__getitem__,
                default=None,
            )
    if status not in ("delivered", "read", "played"):
        return
    try:
        receipt = Receipt.model_validate(envelope.event)
    except ValidationError:
        raise HTTPException(400, "Recibo inválido.") from None
    if not receipt.from_me:
        return
    for provider_id in sorted(set(receipt.ids)):
        await record_receipt(db, connection_id, provider_id, STATUS_ORDER[status])
    rows = await db.scalars(
        select(UazapiMessage)
        .where(
            UazapiMessage.connection_id == connection_id,
            UazapiMessage.direction == "outbound",
            UazapiMessage.provider_message_id.in_(receipt.ids),
        )
        .order_by(UazapiMessage.id)
        .with_for_update()
    )
    for row in rows:
        apply_status(row, status)


@router.post("/webhook/{connection_id}", status_code=204)
async def receive_webhook(
    connection_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
) -> Response:
    envelope = await read_envelope(request)
    await authorize(db, connection_id, envelope.token)
    if envelope.event_type == "messages_update":
        await apply_receipt(db, connection_id, envelope)
    if envelope.event_type == "messages":
        if isinstance(envelope.message, dict) and envelope.message.get("fromMe") is True:
            await reconcile_echo(db, connection_id, envelope.message)
            return Response(status_code=204)
        try:
            message = IncomingMessage.model_validate(envelope.message)
        except ValidationError:
            raise HTTPException(400, "Mensagem inválida.") from None
        await store_message(db, connection_id, message)
    return Response(status_code=204)
