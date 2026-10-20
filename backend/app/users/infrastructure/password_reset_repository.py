from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.domain.repository import PasswordResetRepository
from app.users.infrastructure.models import PasswordResetTokenModel


class SQLAlchemyPasswordResetRepository(PasswordResetRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, user_id: UUID, token_hash: str, expires_at: datetime) -> None:
        now = datetime.now(UTC)
        await self._db.execute(
            update(PasswordResetTokenModel)
            .where(
                PasswordResetTokenModel.user_id == user_id,
                PasswordResetTokenModel.used_at.is_(None),
            )
            .values(used_at=now)
        )
        self._db.add(
            PasswordResetTokenModel(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
        )
        await self._db.flush()

    async def consume(self, token_hash: str) -> UUID | None:
        now = datetime.now(UTC)
        token = await self._db.scalar(
            select(PasswordResetTokenModel)
            .where(
                PasswordResetTokenModel.token_hash == token_hash,
                PasswordResetTokenModel.used_at.is_(None),
                PasswordResetTokenModel.expires_at > now,
            )
            .with_for_update()
        )
        if token is None:
            return None
        token.used_at = now
        await self._db.flush()
        return token.user_id
