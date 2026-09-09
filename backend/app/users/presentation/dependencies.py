from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import Settings, get_settings
from app.database.session import get_db
from app.security.jwt import JWTService
from app.security.password import PasswordHasher
from app.users.application.change_password import ChangePassword
from app.users.application.create_user import CreateUser
from app.users.application.delete_user import DeleteUser
from app.users.application.get_user import GetUser
from app.users.application.list_users import ListUsers
from app.users.application.login_user import LoginUser
from app.users.application.logout_user import LogoutUser
from app.users.application.password_reset import RequestPasswordReset, ResetPassword
from app.users.application.refresh_access import RefreshAccess
from app.users.application.update_user import UpdateUser
from app.users.domain.enums import UserStatus
from app.users.domain.user import User
from app.users.infrastructure.email import SMTPPasswordResetSender
from app.users.infrastructure.repository import (
    SQLAlchemyPasswordResetRepository,
    SQLAlchemyRefreshSessionRepository,
    SQLAlchemyUserRepository,
)

bearer_scheme = HTTPBearer(auto_error=False)


def get_user_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SQLAlchemyUserRepository:
    return SQLAlchemyUserRepository(db)


def get_refresh_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SQLAlchemyRefreshSessionRepository:
    return SQLAlchemyRefreshSessionRepository(db)


def get_reset_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SQLAlchemyPasswordResetRepository:
    return SQLAlchemyPasswordResetRepository(db)


def get_password_hasher() -> PasswordHasher:
    return PasswordHasher()


def get_jwt_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> JWTService:
    return JWTService(
        secret_key=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        expiration_minutes=settings.access_token_expiration_minutes,
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    jwt_service: Annotated[JWTService, Depends(get_jwt_service)],
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    try:
        payload = jwt_service.decode_access_token(credentials.credentials)
        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise ValueError
        user_id = UUID(subject)
    except (TypeError, ValueError) as error:
        raise unauthorized from error

    user = await repository.find_by_id(user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise unauthorized
    return user


def get_create_user(
    repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    password_hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
) -> CreateUser:
    return CreateUser(repository, password_hasher)


def get_list_users(
    repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
) -> ListUsers:
    return ListUsers(repository)


def get_user_by_id(
    repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
) -> GetUser:
    return GetUser(repository)


def get_update_user(
    user_repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    refresh_repository: Annotated[
        SQLAlchemyRefreshSessionRepository, Depends(get_refresh_repository)
    ],
) -> UpdateUser:
    return UpdateUser(user_repository, refresh_repository)


def get_delete_user(
    repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
) -> DeleteUser:
    return DeleteUser(repository)


def get_login_user(
    user_repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    refresh_repository: Annotated[
        SQLAlchemyRefreshSessionRepository, Depends(get_refresh_repository)
    ],
    password_hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
    jwt_service: Annotated[JWTService, Depends(get_jwt_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginUser:
    return LoginUser(
        user_repository,
        refresh_repository,
        password_hasher,
        jwt_service,
        settings.refresh_token_expiration_days,
    )


def get_refresh_access(
    user_repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    refresh_repository: Annotated[
        SQLAlchemyRefreshSessionRepository, Depends(get_refresh_repository)
    ],
    jwt_service: Annotated[JWTService, Depends(get_jwt_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RefreshAccess:
    return RefreshAccess(
        user_repository,
        refresh_repository,
        jwt_service,
        settings.refresh_token_expiration_days,
    )


def get_logout_user(
    repository: Annotated[SQLAlchemyRefreshSessionRepository, Depends(get_refresh_repository)],
) -> LogoutUser:
    return LogoutUser(repository)


def get_change_password(
    user_repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    refresh_repository: Annotated[
        SQLAlchemyRefreshSessionRepository, Depends(get_refresh_repository)
    ],
    password_hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
) -> ChangePassword:
    return ChangePassword(user_repository, refresh_repository, password_hasher)


def get_request_password_reset(
    user_repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    reset_repository: Annotated[SQLAlchemyPasswordResetRepository, Depends(get_reset_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RequestPasswordReset:
    sender = SMTPPasswordResetSender(
        host=settings.smtp_host,
        port=settings.smtp_port,
        from_email=settings.smtp_from_email,
        reset_url=settings.password_reset_url,
    )
    return RequestPasswordReset(
        user_repository,
        reset_repository,
        sender,
        settings.password_reset_expiration_minutes,
    )


def get_reset_password(
    user_repository: Annotated[SQLAlchemyUserRepository, Depends(get_user_repository)],
    reset_repository: Annotated[SQLAlchemyPasswordResetRepository, Depends(get_reset_repository)],
    refresh_repository: Annotated[
        SQLAlchemyRefreshSessionRepository, Depends(get_refresh_repository)
    ],
    password_hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
) -> ResetPassword:
    return ResetPassword(
        user_repository,
        reset_repository,
        refresh_repository,
        password_hasher,
    )
