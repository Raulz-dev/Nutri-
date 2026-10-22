import asyncio
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, Request
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Integer,
    String,
    case,
    delete,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Mapped, mapped_column

from app.config.settings import get_settings
from app.database.base import Base
from app.database.session import AsyncSessionLocal
from app.users.domain.cpf import normalize_cpf

logger = logging.getLogger("nutri.security")
email_adapter = TypeAdapter(EmailStr)


class AuthAttemptModel(Base):
    __tablename__ = "auth_attempts"
    __table_args__ = (CheckConstraint("attempts >= 0", name="ck_auth_attempts_nonnegative"),)

    bucket_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


def bucket_key(category: str, identifier: str) -> str:
    # A keyed hash prevents storing IPs, e-mails, CPFs or tokens in the counter table.
    return hmac.new(
        get_settings().jwt_secret.encode(),
        f"{category}\0{identifier}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def reserve_attempt(key: str, limit: int, seconds: int) -> tuple[str, datetime]:
    try:
        async with asyncio.timeout(3), AsyncSessionLocal() as db, db.begin():
            now = func.clock_timestamp()
            expired = AuthAttemptModel.expires_at <= now
            statement = insert(AuthAttemptModel).values(
                bucket_key=key, attempts=1, expires_at=now + timedelta(seconds=seconds)
            )
            statement = statement.on_conflict_do_update(
                index_elements=[AuthAttemptModel.bucket_key],
                set_={
                    "attempts": case((expired, 1), else_=AuthAttemptModel.attempts + 1),
                    "expires_at": case(
                        (expired, statement.excluded.expires_at), else_=AuthAttemptModel.expires_at
                    ),
                },
                where=or_(expired, AuthAttemptModel.attempts < limit),
            ).returning(AuthAttemptModel.expires_at)
            expires_at = await db.scalar(statement)
            retry_after = 0
            if expires_at is None:
                retry_after = int(
                    await db.scalar(
                        select(
                            func.greatest(
                                1,
                                func.ceil(func.extract("epoch", AuthAttemptModel.expires_at - now)),
                            )
                        ).where(AuthAttemptModel.bucket_key == key)
                    )
                )
        # Commit independently of the request transaction, including failed logins.
    except (SQLAlchemyError, TimeoutError) as error:
        logger.warning("auth_rate_limit_unavailable exception_type=%s", type(error).__name__)
        raise HTTPException(
            503, "Autenticação temporariamente indisponível.", headers={"Retry-After": "5"}
        ) from error
    if retry_after:
        raise HTTPException(
            429,
            f"Muitas tentativas. Tente novamente em {retry_after} segundos.",
            headers={"Retry-After": str(retry_after)},
        )
    return key, expires_at


async def release_successful_attempt(reservation: tuple[str, datetime]) -> None:
    key, expires_at = reservation
    try:
        async with asyncio.timeout(3), AsyncSessionLocal() as db, db.begin():
            await db.execute(
                update(AuthAttemptModel)
                .where(
                    AuthAttemptModel.bucket_key == key, AuthAttemptModel.expires_at == expires_at
                )
                .values(attempts=func.greatest(0, AuthAttemptModel.attempts - 1))
            )
    except (SQLAlchemyError, TimeoutError) as error:
        # Keep the attempt counted rather than opening the limit after a database failure.
        logger.warning("auth_rate_limit_release_failed exception_type=%s", type(error).__name__)


async def cleanup_expired_attempts() -> None:
    try:
        async with asyncio.timeout(3), AsyncSessionLocal() as db, db.begin():
            stale = (
                select(AuthAttemptModel.bucket_key)
                .where(AuthAttemptModel.expires_at < func.clock_timestamp() - timedelta(days=1))
                .limit(500)
                .with_for_update(skip_locked=True)
            )
            await db.execute(delete(AuthAttemptModel).where(AuthAttemptModel.bucket_key.in_(stale)))
    except (SQLAlchemyError, TimeoutError) as error:
        logger.warning("auth_rate_limit_cleanup_failed exception_type=%s", type(error).__name__)


SENSITIVE_ROUTES = {
    ("POST", "/api/v1/users"): "register",
    ("POST", "/api/v1/auth/login"): "login",
    ("POST", "/api/v1/auth/password/forgot"): "recover",
    ("POST", "/api/v1/auth/password/reset"): "reset",
    ("POST", "/api/v1/auth/invitations/accept"): "invitation",
    ("POST", "/api/v1/auth/refresh"): "refresh",
    ("POST", "/api/v1/users/me/password"): "credentials",
    ("PUT", "/api/v1/account/settings"): "credentials",
    ("PUT", "/api/v1/account/cpf"): "credentials",
}


def request_category(request: Request) -> str | None:
    path = request.scope["path"]
    root_path = request.scope.get("root_path", "").rstrip("/")
    if root_path and path.startswith(f"{root_path}/"):
        path = path[len(root_path) :]
    return SENSITIVE_ROUTES.get((request.method, path))


async def limit_sensitive_requests(request: Request) -> None:
    category = request_category(request)
    if category is None:
        return
    settings = get_settings()
    ip = request.client.host if request.client else "unknown"
    # Do not trust forwarded headers supplied directly by clients.
    await reserve_attempt(bucket_key(f"ip:{category}", ip), settings.auth_rate_limit, 60)
    if secrets.randbelow(100) == 0:
        await cleanup_expired_attempts()
    if category in {"refresh", "credentials"}:
        return
    try:
        body = await request.json()
    except ValueError:
        return
    if not isinstance(body, dict):
        return
    identifier = (
        body.get("email") if category in {"login", "register", "recover"} else body.get("token")
    )
    if not isinstance(identifier, str):
        return
    if category in {"login", "register", "recover"}:
        try:
            identifier = str(email_adapter.validate_python(identifier)).lower()
        except ValidationError:
            return
    reservation = await reserve_attempt(
        bucket_key(f"account:{category}", identifier),
        settings.auth_account_rate_limit,
        settings.auth_account_window_seconds,
    )
    if category == "login":
        request.state.auth_attempt = reservation
    elif category == "register":
        try:
            cpf = normalize_cpf(body.get("cpf"))
        except ValueError:
            return
        await reserve_attempt(
            bucket_key("account:register-cpf", cpf),
            settings.auth_account_rate_limit,
            settings.auth_account_window_seconds,
        )


async def limit_credential_attempt(request: Request, user_id: UUID) -> None:
    if request_category(request) != "credentials":
        return
    settings = get_settings()
    request.state.auth_attempt = await reserve_attempt(
        bucket_key("account:credentials", str(user_id)),
        settings.auth_account_rate_limit,
        settings.auth_account_window_seconds,
    )
