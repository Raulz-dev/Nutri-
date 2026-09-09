from uuid import UUID

from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import (
    UserAccessDeniedError,
    UserEmailAlreadyExistsError,
    UserNotFoundError,
)
from app.users.domain.repository import RefreshSessionRepository, UserRepository
from app.users.domain.user import User


class UpdateUser:
    def __init__(
        self,
        user_repository: UserRepository,
        refresh_repository: RefreshSessionRepository,
    ) -> None:
        self._user_repository = user_repository
        self._refresh_repository = refresh_repository

    async def execute(
        self,
        actor: User,
        user_id: UUID,
        *,
        name: str | None = None,
        email: str | None = None,
        role: UserRole | None = None,
        status: UserStatus | None = None,
    ) -> User:
        is_admin = actor.role == UserRole.ADMIN
        if not is_admin and actor.id != user_id:
            raise UserAccessDeniedError("Você não tem permissão para atualizar este usuário.")
        if not is_admin and (role is not None or status is not None):
            raise UserAccessDeniedError("Apenas administradores podem alterar perfil ou status.")

        user = await self._user_repository.find_by_id(user_id)
        if user is None:
            raise UserNotFoundError("Usuário não encontrado.")

        if name is not None:
            user.change_name(name)
        if email is not None:
            existing = await self._user_repository.find_by_email(email)
            if existing is not None and existing.id != user.id:
                raise UserEmailAlreadyExistsError("E-mail já cadastrado.")
            user.change_email(email)
        if role is not None:
            user.change_role(role)
        if status is not None:
            user.change_status(status)

        updated_user = await self._user_repository.update(user)
        if status == UserStatus.BLOCKED:
            await self._refresh_repository.revoke_all_for_user(user.id)
        return updated_user
