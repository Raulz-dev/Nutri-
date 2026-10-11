from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, IdMixin


class ProfessionalProfileModel(Base):
    __tablename__ = "professional_profiles"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    crn: Mapped[str] = mapped_column(String(80), default="")
    contact: Mapped[str] = mapped_column(String(200), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    revision: Mapped[int] = mapped_column(default=1)


class SupportMessageModel(Base, IdMixin):
    __tablename__ = "support_messages"
    admin_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    nutritionist_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    sender_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("length(trim(text)) > 0", name="ck_support_message_nonblank"),
        Index("ix_support_messages_pair_sent", "admin_id", "nutritionist_id", "sent_at", "id"),
    )
