from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, IdMixin, TimestampMixin


class WhatsAppConnection(Base, IdMixin, TimestampMixin):
    __tablename__ = "whatsapp_connections"
    nutritionist_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    phone_number_id: Mapped[str] = mapped_column(String(100), unique=True)
    active: Mapped[bool] = mapped_column(default=True)


class WhatsAppContact(Base, IdMixin, TimestampMixin):
    __tablename__ = "whatsapp_contacts"
    connection_id: Mapped[UUID] = mapped_column(ForeignKey("whatsapp_connections.id"))
    assignment_id: Mapped[UUID] = mapped_column(ForeignKey("care_assignments.id"), unique=True)
    phone: Mapped[str] = mapped_column(String(16))
    last_inbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("connection_id", "phone", name="uq_whatsapp_contact_phone"),)


class WhatsAppMessage(Base, IdMixin, TimestampMixin):
    __tablename__ = "whatsapp_messages"
    contact_id: Mapped[UUID] = mapped_column(ForeignKey("whatsapp_contacts.id"))
    direction: Mapped[str] = mapped_column(String(10))
    text: Mapped[str] = mapped_column(Text)
    external_id: Mapped[str | None] = mapped_column(String(300), unique=True)
    status: Mapped[str] = mapped_column(String(20))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(80))
    __table_args__ = (
        CheckConstraint("direction IN ('inbound', 'outbound')", name="ck_whatsapp_direction"),
        CheckConstraint(
            "status IN ('received','queued','sending','unknown',"
            "'sent','delivered','read','failed')",
            name="ck_whatsapp_status",
        ),
        CheckConstraint("length(trim(text)) > 0", name="ck_whatsapp_text"),
        Index("ix_whatsapp_messages_history", "contact_id", "occurred_at", "id"),
        Index("ix_whatsapp_messages_pending", "status", "created_at"),
    )


class WhatsAppEvent(Base, IdMixin, TimestampMixin):
    __tablename__ = "whatsapp_events"
    connection_id: Mapped[UUID] = mapped_column(ForeignKey("whatsapp_connections.id"))
    event_key: Mapped[str] = mapped_column(String(64), unique=True)
    payload: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_whatsapp_events_pending", "processed_at", "created_at"),)


class WhatsAppSocketTicket(Base):
    __tablename__ = "whatsapp_socket_tickets"
    ticket_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    session_family: Mapped[str] = mapped_column(String(64))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_whatsapp_socket_tickets_expiry", "expires_at"),)
