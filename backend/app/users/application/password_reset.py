from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

from app.security.password import PasswordHasher
from app.security.tokens import create_opaque_token, hash_token
from app.users.domain.exceptions import (
    InvalidPasswordResetTokenError,
    PasswordMismatchError,
)
from app.users.domain.repository import (
    PasswordResetRepository,
    RefreshSessionRepository,
    UserRepository,
)

SendPasswordReset = Callable[[str, str], Awaitable[None]]


class RequestPasswordReset:
    def __init__(
        self,
        user_repository: UserRepository,
        reset_repository: PasswordResetRepository,
        send_password_reset: SendPasswordReset,
        expiration_minutes: int,
    ) -> None:
        self._user_repository = user_repository
        self._reset_repository = reset_repository
        self._send_password_reset = send_password_reset
        self._expiration_minutes = expiration_minutes

    async def execute(self, email: str) -> None:
        user = await self._user_repository.find_by_email(email.strip().lower())
        if user is None:
            return

        token = create_opaque_token()
        await self._reset_repository.create(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(minutes=self._expiration_minutes),
        )
        await self._send_password_reset(user.email, token)


class ResetPassword:
    def __init__(
        self,
        user_repository: UserRepository,
        reset_repository: PasswordResetRepository,
        refresh_repository: RefreshSessionRepository,
        password_hasher: PasswordHasher,
    ) -> None:
        self._user_repository = user_repository
        self._reset_repository = reset_repository
        self._refresh_repository = refresh_repository
        self._password_hasher = password_hasher

    async def execute(self, token: str, new_password: str, confirmation: str) -> None:
        if new_password != confirmation:
            raise PasswordMismatchError("A confirmação da nova senha não corresponde.")

        user_id = await self._reset_repository.consume(hash_token(token))
        if user_id is None:
            raise InvalidPasswordResetTokenError("Token inválido ou expirado.")

        user = await self._user_repository.find_by_id(user_id)
        if user is None:
            raise InvalidPasswordResetTokenError("Token inválido ou expirado.")

        user.change_password_hash(self._password_hasher.hash(new_password))
        await self._user_repository.update(user)
        await self._refresh_repository.revoke_all_for_user(user.id)
