from uuid import UUID

from app.users.domain.enums import UserRole
from app.users.domain.exceptions import UserAccessDeniedError, UserNotFoundError
from app.users.domain.repository import UserRepository
from app.users.domain.user import User


class GetUser:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def execute(self, actor: User, user_id: UUID) -> User:
        if actor.role != UserRole.ADMIN and actor.id != user_id:
            raise UserAccessDeniedError("Você não tem permissão para acessar este usuário.")

        user = await self._repository.find_by_id(user_id)
        if user is None:
            raise UserNotFoundError("Usuário não encontrado.")
        return user
