from datetime import datetime
from typing import Protocol
from uuid import UUID

from app.users.domain.user import User


class UserRepository(Protocol):
    async def create(self, user: User) -> User: ...

    async def find_by_id(self, user_id: UUID) -> User | None: ...

    async def find_by_email(self, email: str) -> User | None: ...

    async def list(self, offset: int, limit: int) -> tuple[list[User], int]: ...

    async def update(self, user: User) -> User: ...

    async def delete(self, user_id: UUID) -> None: ...


class RefreshSessionRepository(Protocol):
    async def create(self, user_id: UUID, token_hash: str, expires_at: datetime) -> None: ...

    async def rotate(
        self,
        current_token_hash: str,
        new_token_hash: str,
        new_expires_at: datetime,
    ) -> UUID | None: ...

    async def revoke(self, token_hash: str) -> None: ...

    async def revoke_all_for_user(self, user_id: UUID) -> None: ...


class PasswordResetRepository(Protocol):
    async def create(self, user_id: UUID, token_hash: str, expires_at: datetime) -> None: ...

    async def consume(self, token_hash: str) -> UUID | None: ...
