from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole
from app.users.domain.exceptions import (
    InvalidUserRoleError,
    UserEmailAlreadyExistsError,
)
from app.users.domain.repository import UserRepository
from app.users.domain.user import User


class CreateUser:
    def __init__(self, repository: UserRepository, password_hasher: PasswordHasher) -> None:
        self._repository = repository
        self._password_hasher = password_hasher

    async def execute(self, name: str, email: str, password: str, role: UserRole) -> User:
        if role != UserRole.PATIENT:
            raise InvalidUserRoleError("O cadastro público permite apenas pacientes.")

        normalized_email = email.strip().lower()
        if await self._repository.find_by_email(normalized_email) is not None:
            raise UserEmailAlreadyExistsError("E-mail já cadastrado.")

        user = User(
            name=name,
            email=normalized_email,
            password_hash=self._password_hasher.hash(password),
            role=role,
        )
        return await self._repository.create(user)
