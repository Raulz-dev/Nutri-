from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, IdMixin


class CareAssignmentModel(Base, IdMixin):
    __tablename__ = "care_assignments"
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    nutritionist_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("patient_id <> nutritionist_id", name="ck_assignment_distinct_users"),
        Index(
            "uq_assignment_active_patient",
            "patient_id",
            unique=True,
            postgresql_where=ended_at.is_(None),
        ),
    )


class CareLinkInvitationModel(Base, IdMixin):
    __tablename__ = "care_link_invitations"
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    nutritionist_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        Index(
            "uq_care_link_invite_pending_pair",
            "patient_id",
            "nutritionist_id",
            unique=True,
            postgresql_where=(
                accepted_at.is_(None) & declined_at.is_(None) & canceled_at.is_(None)
            ),
        ),
    )


class InvitationModel(Base, IdMixin):
    __tablename__ = "invitations"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmailOutboxModel(Base, IdMixin):
    __tablename__ = "email_outbox"
    invitation_id: Mapped[UUID] = mapped_column(ForeignKey("invitations.id"), unique=True)
    payload: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        Index("ix_outbox_pending", "available_at", postgresql_where=payload.is_not(None)),
    )
