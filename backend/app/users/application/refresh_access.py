from datetime import UTC, datetime, timedelta

from app.security.jwt import JWTService
from app.security.tokens import create_opaque_token, hash_token
from app.users.application.auth_tokens import AuthTokens
from app.users.domain.enums import UserStatus
from app.users.domain.exceptions import InvalidRefreshTokenError
from app.users.domain.repository import RefreshSessionRepository, UserRepository


class RefreshAccess:
    def __init__(
        self,
        user_repository: UserRepository,
        refresh_repository: RefreshSessionRepository,
        jwt_service: JWTService,
        refresh_expiration_days: int,
    ) -> None:
        self._user_repository = user_repository
        self._refresh_repository = refresh_repository
        self._jwt_service = jwt_service
        self._refresh_expiration_days = refresh_expiration_days

    async def execute(self, current_token: str) -> AuthTokens:
        new_token = create_opaque_token()
        user_id = await self._refresh_repository.rotate(
            current_token_hash=hash_token(current_token),
            new_token_hash=hash_token(new_token),
            new_expires_at=datetime.now(UTC) + timedelta(days=self._refresh_expiration_days),
        )
        if user_id is None:
            raise InvalidRefreshTokenError("Refresh token inválido ou expirado.")

        user = await self._user_repository.find_by_id(user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            await self._refresh_repository.revoke(hash_token(new_token))
            raise InvalidRefreshTokenError("Refresh token inválido ou expirado.")

        return AuthTokens(
            access_token=self._jwt_service.create_access_token(user.id),
            refresh_token=new_token,
        )
