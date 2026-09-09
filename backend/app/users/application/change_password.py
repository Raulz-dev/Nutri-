from app.security.password import PasswordHasher
from app.users.domain.exceptions import InvalidCredentialsError, PasswordMismatchError
from app.users.domain.repository import RefreshSessionRepository, UserRepository
from app.users.domain.user import User


class ChangePassword:
    def __init__(
        self,
        user_repository: UserRepository,
        refresh_repository: RefreshSessionRepository,
        password_hasher: PasswordHasher,
    ) -> None:
        self._user_repository = user_repository
        self._refresh_repository = refresh_repository
        self._password_hasher = password_hasher

    async def execute(
        self,
        user: User,
        current_password: str,
        new_password: str,
        confirmation: str,
    ) -> None:
        if new_password != confirmation:
            raise PasswordMismatchError("A confirmação da nova senha não corresponde.")
        if not self._password_hasher.verify(current_password, user.password_hash):
            raise InvalidCredentialsError("Senha atual inválida.")

        user.change_password_hash(self._password_hasher.hash(new_password))
        await self._user_repository.update(user)
        await self._refresh_repository.revoke_all_for_user(user.id)
