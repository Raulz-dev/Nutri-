from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.models import EmailOutboxModel, InvitationModel
from app.care.policies import (
    audit,
    cancel_pending_link_invitations,
    lock_users,
    require_no_assignments,
    utcnow,
)
from app.operations import actor_id
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import (
    UserAccessDeniedError,
    UserConflictError,
    UserEmailAlreadyExistsError,
)
from app.users.domain.repository import UserRepository
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
        audit(
            self._db,
            "create",
            "user",
            model.id,
            actor_override=model.id if actor_id.get() is None else None,
            role=model.role.value,
        )
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
        locked = await lock_users(self._db, user.id)
        model = locked.get(user.id)
        if model is None:
            raise RuntimeError("Usuário não encontrado durante a atualização.")
        actor = locked.get(actor_id.get())
        if actor and actor.id != user.id and actor.role != UserRole.ADMIN:
            raise UserAccessDeniedError("Acesso não autorizado.")
        if (
            actor
            and actor.id == user.id
            and (user.role != model.role or user.status != model.status)
        ):
            raise UserAccessDeniedError("Não é permitido alterar o próprio perfil ou status.")
        if model and model.deactivated_at:
            raise UserConflictError("Conta desativada.")
        if user.role == UserRole.NUTRITIONIST and model.role != UserRole.NUTRITIONIST:
            raise UserConflictError("Nutricionistas devem ser cadastrados por convite.")
        if (
            model.role == UserRole.NUTRITIONIST
            and model.status == UserStatus.BLOCKED
            and model.credentials_changed_at is None
            and (user.email != model.email or user.role != model.role)
        ):
            pending_invite = await self._db.scalar(
                select(InvitationModel.id)
                .where(
                    InvitationModel.user_id == user.id,
                    InvitationModel.used_at.is_(None),
                )
                .limit(1)
            )
            if pending_invite:
                raise UserConflictError("Resolva o convite antes de alterar e-mail ou perfil.")
        if model and model.status == UserStatus.BLOCKED and user.status == UserStatus.ACTIVE:
            pending_invite = await self._db.scalar(
                select(InvitationModel.id)
                .where(
                    InvitationModel.user_id == user.id,
                    InvitationModel.used_at.is_(None),
                )
                .limit(1)
            )
            if pending_invite:
                raise UserConflictError(
                    "O profissional deve concluir o convite antes de ser ativado."
                )
        if model and (
            (user.role != model.role)
            or (user.status == UserStatus.BLOCKED and model.status != UserStatus.BLOCKED)
        ):
            await require_no_assignments(self._db, user.id)
            await cancel_pending_link_invitations(self._db, user.id)
        model.name = user.name
        model.email = user.email
        password_changed = model.password_hash != user.password_hash
        if password_changed:
            model.credentials_changed_at = utcnow()
        model.password_hash = user.password_hash
        model.role = user.role
        model.status = user.status
        try:
            await self._db.flush()
        except IntegrityError as error:
            await self._db.rollback()
            raise UserEmailAlreadyExistsError("E-mail já cadastrado.") from error
        await self._db.refresh(model)
        audit(
            self._db,
            "change_password" if password_changed else "update",
            "user",
            model.id,
            actor_override=model.id if password_changed and actor_id.get() is None else None,
            role=model.role.value,
            status=model.status.value,
        )
        return self._to_domain(model)

    async def delete(self, user_id: UUID) -> None:
        locked = await lock_users(self._db, user_id)
        model = locked.get(user_id)
        if model is None or model.deactivated_at:
            raise UserConflictError("Conta não disponível.")
        await require_no_assignments(self._db, user_id)
        model.status = UserStatus.BLOCKED
        model.deactivated_at = utcnow()
        await cancel_pending_link_invitations(self._db, user_id)
        pending_invitations = (
            await self._db.scalars(
                select(InvitationModel)
                .where(InvitationModel.user_id == user_id, InvitationModel.used_at.is_(None))
                .with_for_update()
            )
        ).all()
        if pending_invitations:
            now = utcnow()
            for invitation in pending_invitations:
                invitation.used_at = now
            await self._db.execute(
                update(EmailOutboxModel)
                .where(
                    EmailOutboxModel.invitation_id.in_(
                        [invitation.id for invitation in pending_invitations]
                    ),
                    EmailOutboxModel.delivered_at.is_(None),
                )
                .values(payload=None, failed_at=now)
            )
        await self._db.execute(
            update(RefreshSessionModel)
            .where(RefreshSessionModel.user_id == user_id, RefreshSessionModel.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        await self._db.execute(
            update(PasswordResetTokenModel)
            .where(
                PasswordResetTokenModel.user_id == user_id,
                PasswordResetTokenModel.used_at.is_(None),
            )
            .values(used_at=utcnow())
        )
        audit(self._db, "deactivate", "user", user_id)
        await self._db.flush()

    @staticmethod
    def _to_model(user: User) -> UserModel:
        return UserModel(
            id=user.id,
            name=user.name,
            email=user.email,
            password_hash=user.password_hash,
            role=user.role,
            status=user.status,
            deactivated_at=user.deactivated_at,
            credentials_changed_at=user.credentials_changed_at,
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
            deactivated_at=model.deactivated_at,
            credentials_changed_at=model.credentials_changed_at,
        )
