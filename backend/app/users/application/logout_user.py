from app.security.tokens import hash_token
from app.users.domain.repository import RefreshSessionRepository


class LogoutUser:
    def __init__(self, repository: RefreshSessionRepository) -> None:
        self._repository = repository

    async def execute(self, refresh_token: str) -> None:
        await self._repository.revoke(hash_token(refresh_token))
