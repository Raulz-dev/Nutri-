from app.users.domain.enums import UserRole
from app.users.domain.exceptions import UserAccessDeniedError
from app.users.domain.repository import UserRepository
from app.users.domain.user import User


class ListUsers:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def execute(self, actor: User, offset: int, limit: int) -> tuple[list[User], int]:
        if actor.role != UserRole.ADMIN:
            raise UserAccessDeniedError("Apenas administradores podem listar usuários.")
        return await self._repository.list(offset, limit)
