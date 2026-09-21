from uuid import UUID

import pytest

from app.users.application.delete_user import DeleteUser
from app.users.application.list_users import ListUsers
from app.users.application.update_user import UpdateUser
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import CannotDeleteCurrentUserError, UserAccessDeniedError
from app.users.domain.user import User


def make_user(email: str, role: UserRole = UserRole.PATIENT) -> User:
    return User(name="Usuário Teste", email=email, password_hash="hash", role=role)


class FakeUserRepository:
    def __init__(self, users: list[User]) -> None:
        self.users = {user.id: user for user in users}

    async def find_by_id(self, user_id: UUID) -> User | None:
        return self.users.get(user_id)

    async def find_by_email(self, email: str) -> User | None:
        normalized = email.strip().lower()
        return next((user for user in self.users.values() if user.email == normalized), None)

    async def list(self, offset: int, limit: int) -> tuple[list[User], int]:
        users = list(self.users.values())
        return users[offset : offset + limit], len(users)

    async def update(self, user: User) -> User:
        self.users[user.id] = user
        return user

    async def delete(self, user_id: UUID) -> None:
        self.users.pop(user_id)


class FakeRefreshRepository:
    def __init__(self) -> None:
        self.revoked_user_ids: list[UUID] = []

    async def revoke_all_for_user(self, user_id: UUID) -> None:
        self.revoked_user_ids.append(user_id)


@pytest.mark.asyncio
async def test_admin_can_list_users() -> None:
    admin = make_user("admin@example.com", UserRole.ADMIN)
    patient = make_user("patient@example.com")
    users, total = await ListUsers(FakeUserRepository([admin, patient])).execute(admin, 0, 20)

    assert total == 2
    assert users == [admin, patient]


@pytest.mark.asyncio
async def test_patient_cannot_list_users() -> None:
    patient = make_user("patient@example.com")

    with pytest.raises(UserAccessDeniedError):
        await ListUsers(FakeUserRepository([patient])).execute(patient, 0, 20)


@pytest.mark.asyncio
async def test_user_can_update_own_name_and_email() -> None:
    patient = make_user("patient@example.com")
    repository = FakeUserRepository([patient])
    use_case = UpdateUser(repository, FakeRefreshRepository())

    updated = await use_case.execute(
        patient,
        patient.id,
        name="Maria Atualizada",
        email="maria@example.com",
    )

    assert updated.name == "Maria Atualizada"
    assert updated.email == "maria@example.com"


@pytest.mark.asyncio
async def test_patient_cannot_change_own_role() -> None:
    patient = make_user("patient@example.com")
    use_case = UpdateUser(FakeUserRepository([patient]), FakeRefreshRepository())

    with pytest.raises(UserAccessDeniedError):
        await use_case.execute(patient, patient.id, role=UserRole.ADMIN)


@pytest.mark.asyncio
async def test_admin_cannot_change_own_role_or_status() -> None:
    admin = make_user("admin@example.com", UserRole.ADMIN)
    use_case = UpdateUser(FakeUserRepository([admin]), FakeRefreshRepository())

    with pytest.raises(UserAccessDeniedError):
        await use_case.execute(admin, admin.id, role=UserRole.PATIENT)

    with pytest.raises(UserAccessDeniedError):
        await use_case.execute(admin, admin.id, status=UserStatus.BLOCKED)


@pytest.mark.asyncio
async def test_blocking_user_revokes_refresh_sessions() -> None:
    admin = make_user("admin@example.com", UserRole.ADMIN)
    patient = make_user("patient@example.com")
    refresh_repository = FakeRefreshRepository()
    use_case = UpdateUser(FakeUserRepository([admin, patient]), refresh_repository)

    updated = await use_case.execute(admin, patient.id, status=UserStatus.BLOCKED)

    assert updated.status == UserStatus.BLOCKED
    assert refresh_repository.revoked_user_ids == [patient.id]


@pytest.mark.asyncio
async def test_changing_role_revokes_refresh_sessions() -> None:
    admin = make_user("admin@example.com", UserRole.ADMIN)
    patient = make_user("patient@example.com")
    refresh_repository = FakeRefreshRepository()
    use_case = UpdateUser(FakeUserRepository([admin, patient]), refresh_repository)

    updated = await use_case.execute(admin, patient.id, role=UserRole.NUTRITIONIST)

    assert updated.role == UserRole.NUTRITIONIST
    assert refresh_repository.revoked_user_ids == [patient.id]


@pytest.mark.asyncio
async def test_admin_can_delete_another_user() -> None:
    admin = make_user("admin@example.com", UserRole.ADMIN)
    patient = make_user("patient@example.com")
    repository = FakeUserRepository([admin, patient])

    await DeleteUser(repository).execute(admin, patient.id)

    assert patient.id not in repository.users


@pytest.mark.asyncio
async def test_admin_cannot_delete_self() -> None:
    admin = make_user("admin@example.com", UserRole.ADMIN)

    with pytest.raises(CannotDeleteCurrentUserError):
        await DeleteUser(FakeUserRepository([admin])).execute(admin, admin.id)
