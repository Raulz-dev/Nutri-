from uuid import UUID

import pytest

from app.security.password import PasswordHasher
from app.users.application.create_user import CreateUser
from app.users.domain.enums import UserRole
from app.users.domain.exceptions import InvalidUserRoleError, UserEmailAlreadyExistsError
from app.users.domain.user import User


class FakeUserRepository:
    def __init__(self) -> None:
        self.users: dict[UUID, User] = {}

    async def create(self, user: User) -> User:
        self.users[user.id] = user
        return user

    async def find_by_id(self, user_id: UUID) -> User | None:
        return self.users.get(user_id)

    async def find_by_email(self, email: str) -> User | None:
        return next((user for user in self.users.values() if user.email == email), None)

    async def update(self, user: User) -> User:
        self.users[user.id] = user
        return user


@pytest.mark.asyncio
async def test_create_user_hashes_password() -> None:
    repository = FakeUserRepository()
    hasher = PasswordHasher()
    use_case = CreateUser(repository, hasher)

    user = await use_case.execute(
        name="Maria Silva",
        email="maria@example.com",
        password="senha-segura",
        role=UserRole.PATIENT,
    )

    assert user.password_hash != "senha-segura"
    assert hasher.verify("senha-segura", user.password_hash)


@pytest.mark.asyncio
async def test_create_user_rejects_duplicate_email() -> None:
    repository = FakeUserRepository()
    use_case = CreateUser(repository, PasswordHasher())
    payload = {
        "name": "Maria Silva",
        "email": "maria@example.com",
        "password": "senha-segura",
        "role": UserRole.PATIENT,
    }
    await use_case.execute(**payload)

    with pytest.raises(UserEmailAlreadyExistsError):
        await use_case.execute(**payload)


@pytest.mark.asyncio
async def test_public_registration_rejects_admin() -> None:
    use_case = CreateUser(FakeUserRepository(), PasswordHasher())

    with pytest.raises(InvalidUserRoleError):
        await use_case.execute(
            name="Admin Sistema",
            email="admin@example.com",
            password="senha-segura",
            role=UserRole.ADMIN,
        )
