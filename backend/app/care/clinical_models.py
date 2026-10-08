from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, IdMixin


class PatientIntakeRevisionModel(Base, IdMixin):
    __tablename__ = "patient_intake_revisions"

    patient_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("uq_patient_intake_revision", "patient_id", "revision", unique=True),)


class WeightGoalRevisionModel(Base, IdMixin):
    __tablename__ = "weight_goal_revisions"

    patient_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    target_kg: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("uq_weight_goal_revision", "patient_id", "revision", unique=True),
        CheckConstraint("target_kg > 0 AND target_kg <= 500", name="ck_weight_goal_target"),
    )


class MeasurementModel(Base, IdMixin):
    __tablename__ = "measurements"

    patient_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    measured_on: Mapped[date] = mapped_column(Date, nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    body_fat_pct: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    note: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_measurements_patient_date", "patient_id", "measured_on", "created_at"),
        CheckConstraint("weight_kg > 0 AND weight_kg <= 500", name="ck_measurements_weight"),
        CheckConstraint(
            "body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 100)",
            name="ck_measurements_fat",
        ),
    )


class FollowUpModel(Base, IdMixin):
    __tablename__ = "follow_up_notes"

    patient_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_follow_up_notes_patient_created", "patient_id", "created_at"),
        CheckConstraint("length(text) BETWEEN 1 AND 4000", name="ck_follow_up_note_length"),
    )
