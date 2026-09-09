from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.domain.exceptions import UserEmailAlreadyExistsError
from app.users.domain.repository import (
    PasswordResetRepository,
    RefreshSessionRepository,
    UserRepository,
)
from app.users.domain.user import User
from app.users.infrastructure.models import (
    PasswordResetTokenModel,
    RefreshSessionModel,
    UserModel,
)


class SQLAlchemyUserRepository(UserRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, user: User) -> User:
        model = self._to_model(user)
        self._db.add(model)
        try:
            await self._db.flush()
        except IntegrityError as error:
            await self._db.rollback()
            raise UserEmailAlreadyExistsError("E-mail já cadastrado.") from error
        await self._db.refresh(model)
        return self._to_domain(model)

    async def find_by_id(self, user_id: UUID) -> User | None:
        model = await self._db.get(UserModel, user_id)
        return None if model is None else self._to_domain(model)

    async def find_by_email(self, email: str) -> User | None:
        model = await self._db.scalar(
            select(UserModel).where(UserModel.email == email.strip().lower())
        )
        return None if model is None else self._to_domain(model)

    async def list(self, offset: int, limit: int) -> tuple[list[User], int]:
        models = (
            await self._db.scalars(
                select(UserModel).order_by(UserModel.created_at.desc()).offset(offset).limit(limit)
            )
        ).all()
        total = await self._db.scalar(select(func.count()).select_from(UserModel))
        return [self._to_domain(model) for model in models], total or 0

    async def update(self, user: User) -> User:
        model = await self._db.get(UserModel, user.id)
        if model is None:
            raise RuntimeError("Usuário não encontrado durante a atualização.")
        model.name = user.name
        model.email = user.email
        model.password_hash = user.password_hash
        model.role = user.role
        model.status = user.status
        try:
            await self._db.flush()
        except IntegrityError as error:
            await self._db.rollback()
            raise UserEmailAlreadyExistsError("E-mail já cadastrado.") from error
        await self._db.refresh(model)
        return self._to_domain(model)

    async def delete(self, user_id: UUID) -> None:
        await self._db.execute(delete(UserModel).where(UserModel.id == user_id))

    @staticmethod
    def _to_model(user: User) -> UserModel:
        return UserModel(
            id=user.id,
            name=user.name,
            email=user.email,
            password_hash=user.password_hash,
            role=user.role,
            status=user.status,
        )

    @staticmethod
    def _to_domain(model: UserModel) -> User:
        return User(
            id=model.id,
            name=model.name,
            email=model.email,
            password_hash=model.password_hash,
            role=model.role,
            status=model.status,
        )


class SQLAlchemyRefreshSessionRepository(RefreshSessionRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, user_id: UUID, token_hash: str, expires_at: datetime) -> None:
        self._db.add(
            RefreshSessionModel(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
        )
        await self._db.flush()

    async def rotate(
        self,
        current_token_hash: str,
        new_token_hash: str,
        new_expires_at: datetime,
    ) -> UUID | None:
        now = datetime.now(UTC)
        current = await self._db.scalar(
            select(RefreshSessionModel)
            .where(
                RefreshSessionModel.token_hash == current_token_hash,
                RefreshSessionModel.revoked_at.is_(None),
                RefreshSessionModel.expires_at > now,
            )
            .with_for_update()
        )
        if current is None:
            return None

        current.revoked_at = now
        self._db.add(
            RefreshSessionModel(
                user_id=current.user_id,
                token_hash=new_token_hash,
                expires_at=new_expires_at,
            )
        )
        await self._db.flush()
        return current.user_id

    async def revoke(self, token_hash: str) -> None:
        await self._db.execute(
            update(RefreshSessionModel)
            .where(
                RefreshSessionModel.token_hash == token_hash,
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
