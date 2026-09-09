import pytest

from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import InvalidUserEmailError, InvalidUserNameError
from app.users.domain.user import User


def make_user(**overrides: object) -> User:
    values = {
        "name": "Maria Silva",
        "email": "MARIA@example.com",
        "password_hash": "hash",
        "role": UserRole.PATIENT,
    }
    values.update(overrides)
    return User(**values)  # type: ignore[arg-type]


def test_user_normalizes_name_and_email() -> None:
    user = make_user(name="  Maria   Silva  ")

    assert user.name == "Maria Silva"
    assert user.email == "maria@example.com"
    assert user.status == UserStatus.ACTIVE


@pytest.mark.parametrize("name", ["", "A", "Maria 2"])
def test_user_rejects_invalid_name(name: str) -> None:
    with pytest.raises(InvalidUserNameError):
        make_user(name=name)


def test_user_rejects_invalid_email() -> None:
    with pytest.raises(InvalidUserEmailError):
        make_user(email="email-invalido")


def test_user_can_be_blocked_and_reactivated() -> None:
    user = make_user()

    user.block()
    assert user.status == UserStatus.BLOCKED

    user.activate()
    assert user.status == UserStatus.ACTIVE
