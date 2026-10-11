from datetime import date, datetime, time
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, IdMixin


class AppointmentModel(Base, IdMixin):
    __tablename__ = "appointments"

    patient_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    nutritionist_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    author_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    appointment_on: Mapped[date] = mapped_column(Date, nullable=False)
    appointment_at: Mapped[time] = mapped_column(Time, nullable=False)
    format: Mapped[str] = mapped_column(String(20), nullable=False)
    location: Mapped[str] = mapped_column(String(500), nullable=False)
    guidance: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("format IN ('Presencial', 'Online')", name="ck_appointment_format"),
        CheckConstraint(
            "status IN ('scheduled', 'completed', 'cancelled')", name="ck_appointment_status"
        ),
        CheckConstraint("revision > 0", name="ck_appointment_revision"),
        Index("ix_appointments_patient_date", "patient_id", "appointment_on", "appointment_at"),
        Index(
            "ix_appointments_nutritionist_date",
            "nutritionist_id",
            "appointment_on",
            "appointment_at",
        ),
        Index(
            "uq_appointment_patient_slot",
            "patient_id",
            "appointment_on",
            "appointment_at",
            unique=True,
            postgresql_where=text("status = 'scheduled'"),
        ),
        Index(
            "uq_appointment_nutritionist_slot",
            "nutritionist_id",
            "appointment_on",
            "appointment_at",
            unique=True,
            postgresql_where=text("status = 'scheduled'"),
        ),
    )


class CareMessageModel(Base, IdMixin):
    __tablename__ = "care_messages"

    assignment_id: Mapped[UUID] = mapped_column(ForeignKey("care_assignments.id"), nullable=False)
    sender_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("length(trim(text)) > 0", name="ck_care_message_nonblank"),
        Index("ix_care_messages_assignment_sent", "assignment_id", "sent_at", "id"),
    )
