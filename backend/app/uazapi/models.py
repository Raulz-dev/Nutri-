from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, IdMixin, TimestampMixin


class UazapiConnection(Base, IdMixin, TimestampMixin):
    __tablename__ = "uazapi_connections"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    instance_id: Mapped[str] = mapped_column(String(200), unique=True)
    base_url: Mapped[str | None] = mapped_column(Text)
    encrypted_token: Mapped[str | None] = mapped_column(Text)


class UazapiConversation(Base, IdMixin, TimestampMixin):
    __tablename__ = "uazapi_conversations"
    __table_args__ = (
        UniqueConstraint("connection_id", "external_id", name="uq_uazapi_conversation_external"),
        UniqueConstraint("connection_id", "id", name="uq_uazapi_conversation_scope"),
    )

    connection_id: Mapped[UUID] = mapped_column(ForeignKey("uazapi_connections.id"))
    external_id: Mapped[str] = mapped_column(String(300))
    title: Mapped[str | None] = mapped_column(String(255))


class UazapiSender(Base, IdMixin, TimestampMixin):
    __tablename__ = "uazapi_senders"
    __table_args__ = (
        UniqueConstraint("connection_id", "external_id", name="uq_uazapi_sender_external"),
        UniqueConstraint("connection_id", "id", name="uq_uazapi_sender_scope"),
    )

    connection_id: Mapped[UUID] = mapped_column(ForeignKey("uazapi_connections.id"))
    external_id: Mapped[str] = mapped_column(String(300))
    display_name: Mapped[str | None] = mapped_column(String(255))
    assignment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("care_assignments.id", ondelete="SET NULL"), index=True
    )


class UazapiMessage(Base, IdMixin, TimestampMixin):
    __tablename__ = "uazapi_messages"
    __table_args__ = (
        UniqueConstraint("connection_id", "external_id", name="uq_uazapi_message_external"),
        ForeignKeyConstraint(
            ["connection_id", "conversation_id"],
            ["uazapi_conversations.connection_id", "uazapi_conversations.id"],
            name="fk_uazapi_message_conversation",
        ),
        ForeignKeyConstraint(
            ["connection_id", "sender_id"],
            ["uazapi_senders.connection_id", "uazapi_senders.id"],
            name="fk_uazapi_message_sender",
        ),
        CheckConstraint("direction IN ('inbound', 'outbound')", name="ck_uazapi_message_direction"),
        Index("ix_uazapi_message_history", "connection_id", "conversation_id", "occurred_at", "id"),
        Index("ix_uazapi_provider_message", "connection_id", "provider_message_id"),
        Index("ix_uazapi_message_sender", "connection_id", "sender_id"),
    )

    connection_id: Mapped[UUID] = mapped_column(ForeignKey("uazapi_connections.id"))
    conversation_id: Mapped[UUID]
    sender_id: Mapped[UUID]
    external_id: Mapped[str] = mapped_column(String(300))
    direction: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(50))
    text: Mapped[str | None] = mapped_column(Text)
    attachment_digest: Mapped[str | None] = mapped_column(String(64))
    delivery_status: Mapped[str | None] = mapped_column(String(16))
    provider_message_id: Mapped[str | None] = mapped_column(String(300))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UazapiAttachment(Base, IdMixin, TimestampMixin):
    __tablename__ = "uazapi_attachments"
    __table_args__ = (CheckConstraint("size_bytes >= 0", name="ck_uazapi_attachment_size"),)

    message_id: Mapped[UUID] = mapped_column(
        ForeignKey("uazapi_messages.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(50))
    mime_type: Mapped[str | None] = mapped_column(String(255))
    filename: Mapped[str | None] = mapped_column(String(255))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    storage_key: Mapped[str | None] = mapped_column(Text)


class UazapiReceipt(Base):
    __tablename__ = "uazapi_receipts"

    connection_id: Mapped[UUID] = mapped_column(
        ForeignKey("uazapi_connections.id", ondelete="CASCADE"), primary_key=True
    )
    provider_message_id: Mapped[str] = mapped_column(String(300), primary_key=True)
    rank: Mapped[int]
