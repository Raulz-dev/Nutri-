from uuid import UUID

from app.users.domain.enums import UserRole
from app.users.domain.exceptions import (
    CannotDeleteCurrentUserError,
    UserAccessDeniedError,
    UserNotFoundError,
)
from app.users.domain.repository import UserRepository
from app.users.domain.user import User


class DeleteUser:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def execute(self, actor: User, user_id: UUID) -> None:
        if actor.role != UserRole.ADMIN:
            raise UserAccessDeniedError("Apenas administradores podem excluir usuários.")
        if actor.id == user_id:
            raise CannotDeleteCurrentUserError("O administrador não pode excluir a própria conta.")
        if await self._repository.find_by_id(user_id) is None:
            raise UserNotFoundError("Usuário não encontrado.")
        await self._repository.delete(user_id)
