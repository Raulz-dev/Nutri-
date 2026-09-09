from datetime import UTC, datetime, timedelta

from app.security.jwt import JWTService
from app.security.password import PasswordHasher
from app.security.tokens import create_opaque_token, hash_token
from app.users.application.auth_tokens import AuthTokens
from app.users.domain.enums import UserStatus
from app.users.domain.exceptions import InvalidCredentialsError, UserBlockedError
from app.users.domain.repository import RefreshSessionRepository, UserRepository


class LoginUser:
    def __init__(
        self,
        user_repository: UserRepository,
        refresh_repository: RefreshSessionRepository,
        password_hasher: PasswordHasher,
        jwt_service: JWTService,
        refresh_expiration_days: int,
    ) -> None:
        self._user_repository = user_repository
        self._refresh_repository = refresh_repository
        self._password_hasher = password_hasher
        self._jwt_service = jwt_service
        self._refresh_expiration_days = refresh_expiration_days

    async def execute(self, email: str, password: str) -> AuthTokens:
        user = await self._user_repository.find_by_email(email.strip().lower())
        if user is None or not self._password_hasher.verify(password, user.password_hash):
            raise InvalidCredentialsError("E-mail ou senha inválidos.")
        if user.status == UserStatus.BLOCKED:
            raise UserBlockedError("Usuário bloqueado.")

        refresh_token = create_opaque_token()
        await self._refresh_repository.create(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=self._refresh_expiration_days),
        )
        return AuthTokens(
            access_token=self._jwt_service.create_access_token(user.id),
            refresh_token=refresh_token,
        )
