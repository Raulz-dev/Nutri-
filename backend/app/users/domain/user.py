from dataclasses import dataclass, field
from uuid import UUID, uuid7

from email_validator import EmailNotValidError, validate_email

from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import (
    InvalidUserEmailError,
    InvalidUserNameError,
    InvalidUserPasswordError,
    InvalidUserRoleError,
    InvalidUserStatusError,
)


@dataclass(slots=True)
class User:
    name: str
    email: str
    password_hash: str
    role: UserRole
    status: UserStatus = UserStatus.ACTIVE
    id: UUID = field(default_factory=uuid7)

    def __post_init__(self) -> None:
        self.name = self._validate_name(self.name)
        self.email = self._validate_email(self.email)
        self.password_hash = self._validate_password_hash(self.password_hash)
        self.role = self._validate_role(self.role)
        self.status = self._validate_status(self.status)

    def change_name(self, value: str) -> None:
        self.name = self._validate_name(value)

    def change_email(self, value: str) -> None:
        self.email = self._validate_email(value)

    def change_password_hash(self, value: str) -> None:
        self.password_hash = self._validate_password_hash(value)

    def change_role(self, value: UserRole) -> None:
        self.role = self._validate_role(value)

    def change_status(self, value: UserStatus) -> None:
        self.status = self._validate_status(value)

    def block(self) -> None:
        self.status = UserStatus.BLOCKED

    def activate(self) -> None:
        self.status = UserStatus.ACTIVE

    @staticmethod
    def _validate_name(value: str) -> str:
        if not isinstance(value, str):
            raise InvalidUserNameError("O nome deve ser um texto.")
        normalized = " ".join(value.split())
        if len(normalized) < 2 or len(normalized) > 120:
            raise InvalidUserNameError("O nome deve ter entre 2 e 120 caracteres.")
        if any(character.isdigit() for character in normalized):
            raise InvalidUserNameError("O nome não pode conter números.")
        return normalized

    @staticmethod
    def _validate_email(value: str) -> str:
        if not isinstance(value, str):
            raise InvalidUserEmailError("O e-mail deve ser um texto.")
        try:
            validated = validate_email(value, check_deliverability=False)
        except EmailNotValidError as error:
            raise InvalidUserEmailError("O e-mail informado é inválido.") from error
        return validated.normalized.lower()

    @staticmethod
    def _validate_password_hash(value: str) -> str:
        if not isinstance(value, str) or not value:
            raise InvalidUserPasswordError("O hash da senha não pode ser vazio.")
        return value

    @staticmethod
    def _validate_role(value: UserRole) -> UserRole:
        if not isinstance(value, UserRole):
            raise InvalidUserRoleError("O perfil do usuário é inválido.")
        return value

    @staticmethod
    def _validate_status(value: UserStatus) -> UserStatus:
        if not isinstance(value, UserStatus):
            raise InvalidUserStatusError("O status do usuário é inválido.")
        return value
