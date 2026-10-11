from datetime import date, datetime
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


class MealPlanModel(Base, IdMixin):
    __tablename__ = "meal_plans"

    patient_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    start_on: Mapped[date] = mapped_column(Date, nullable=False)
    end_on: Mapped[date] = mapped_column(Date, nullable=False)
    effective_end_on: Mapped[date | None] = mapped_column(Date)
    water_liters: Mapped[float] = mapped_column(Numeric(3, 1), nullable=False)
    guidance: Mapped[str] = mapped_column(Text, nullable=False, default="")
    meals: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_meal_plans_patient_created", "patient_id", "created_at"),
        Index(
            "ix_meal_plans_patient_status_period",
            "patient_id",
            "status",
            "start_on",
            "effective_end_on",
        ),
        CheckConstraint("end_on >= start_on", name="ck_meal_plan_period"),
        CheckConstraint("water_liters >= 0 AND water_liters <= 15", name="ck_meal_plan_water"),
        CheckConstraint("revision > 0", name="ck_meal_plan_revision"),
        CheckConstraint("status IN ('draft', 'published', 'closed')", name="ck_meal_plan_status"),
    )
