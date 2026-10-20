from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.domain.repository import RefreshSessionRepository
from app.users.infrastructure.models import (
    AuditEventModel,
    RefreshSessionModel,
)


class SQLAlchemyRefreshSessionRepository(RefreshSessionRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, user_id: UUID, token_hash: str, expires_at: datetime) -> None:
        self._db.add(
            RefreshSessionModel(
                user_id=user_id,
                token_hash=token_hash,
                family_id=token_hash,
                expires_at=expires_at,
            )
        )
        await self._db.flush()
        self._db.add(
            AuditEventModel(
                actor_user_id=user_id,
                action="login",
                entity_type="user",
                entity_id=user_id,
                event_data={},
            )
        )

    async def _lock_family(self, token_hash: str) -> str | None:
        family = await self._db.scalar(
            select(RefreshSessionModel.family_id).where(
                RefreshSessionModel.token_hash == token_hash
            )
        )
        if family:
            await self._db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:family, 0))"),
                {"family": family},
            )
        return family

    async def rotate(
        self, current_token_hash: str, new_token_hash: str, new_expires_at: datetime
    ) -> tuple[UUID, str] | None:
        family = await self._lock_family(current_token_hash)
        if not family:
            return None
        current = await self._db.scalar(
            select(RefreshSessionModel)
            .where(RefreshSessionModel.token_hash == current_token_hash)
            .with_for_update()
        )
        now = datetime.now(UTC)
        if current.revoked_at or current.expires_at <= now:
            await self.revoke(current_token_hash)
            return None
        current.revoked_at = now
        self._db.add(
            RefreshSessionModel(
                user_id=current.user_id,
                family_id=family,
                token_hash=new_token_hash,
                expires_at=new_expires_at,
            )
        )
        await self._db.flush()
        return current.user_id, family

    async def revoke(self, token_hash: str) -> None:
        family = await self._lock_family(token_hash)
        if family:
            await self._db.execute(
                update(RefreshSessionModel)
                .where(
                    RefreshSessionModel.family_id == family,
                    RefreshSessionModel.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(UTC))
            )

    async def revoke_all_for_user(self, user_id: UUID) -> None:
        await self._db.execute(
            update(RefreshSessionModel)
            .where(
                RefreshSessionModel.user_id == user_id,
                RefreshSessionModel.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(UTC))
        )
