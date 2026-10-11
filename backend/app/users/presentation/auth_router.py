from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse

from app.config.settings import get_settings
from app.users.application.login_user import LoginUser
from app.users.application.logout_user import LogoutUser
from app.users.application.password_reset import RequestPasswordReset, ResetPassword
from app.users.application.refresh_access import RefreshAccess
from app.users.domain.exceptions import (
    InvalidCredentialsError,
    InvalidPasswordResetTokenError,
    InvalidRefreshTokenError,
    PasswordMismatchError,
    UserBlockedError,
)
from app.users.presentation.dependencies import (
    get_login_user,
    get_logout_user,
    get_refresh_access,
    get_request_password_reset,
    get_reset_password,
)
from app.users.presentation.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["Auth"])
COOKIE = "nutri_refresh"
COOKIE_PATH = "/api/v1/auth"


def check_origin(request: Request, required: bool = False):
    origin = request.headers.get("origin")
    if (required and not origin) or (origin and origin not in get_settings().cors_origins):
        raise HTTPException(403, "Origem não autorizada.")


def token_response(tokens, request: Request, response: Response):
    browser = bool(request.headers.get("origin"))
    if browser:
        response.set_cookie(
            COOKIE,
            tokens.refresh_token,
            httponly=True,
            secure=get_settings().app_env in ("staging", "production"),
            samesite="lax",
            path=COOKIE_PATH,
            max_age=get_settings().refresh_token_expiration_days * 86400,
        )
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=None if browser else tokens.refresh_token,
        token_type=tokens.token_type,
    )


def refresh_credential(request: Request, data):
    if data is not None:
        check_origin(request)
        return data.refresh_token
    check_origin(request, required=True)
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sessão encerrada.")
    return token


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    use_case: Annotated[LoginUser, Depends(get_login_user)],
) -> TokenResponse:
    try:
        check_origin(request)
        tokens = await use_case.execute(data.email, data.password)
    except InvalidCredentialsError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"},
        ) from error
    except UserBlockedError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    return token_response(tokens, request, response)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    use_case: Annotated[RefreshAccess, Depends(get_refresh_access)],
    data: RefreshRequest | None = None,
) -> TokenResponse:
    try:
        tokens = await use_case.execute(refresh_credential(request, data))
    except InvalidRefreshTokenError as error:
        # Return normally so the transaction persists replay-family revocation.
        failed = JSONResponse({"detail": str(error)}, status_code=401)
        failed.delete_cookie(COOKIE, path=COOKIE_PATH)
        return failed
    return token_response(tokens, request, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    use_case: Annotated[LogoutUser, Depends(get_logout_user)],
    data: LogoutRequest | None = None,
) -> None:
    await use_case.execute(refresh_credential(request, data))
    response.delete_cookie(COOKIE, path=COOKIE_PATH)


@router.post("/password/forgot", response_model=MessageResponse)
async def forgot_password(
    data: ForgotPasswordRequest,
    use_case: Annotated[RequestPasswordReset, Depends(get_request_password_reset)],
) -> MessageResponse:
    await use_case.execute(data.email)
    return MessageResponse(message="Se o e-mail estiver cadastrado, as instruções serão enviadas.")


@router.post("/password/reset", response_model=MessageResponse)
async def reset_password(
    data: ResetPasswordRequest,
    use_case: Annotated[ResetPassword, Depends(get_reset_password)],
) -> MessageResponse:
    try:
        await use_case.execute(
            data.token,
            data.new_password,
            data.new_password_confirmation,
        )
    except (InvalidPasswordResetTokenError, PasswordMismatchError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    return MessageResponse(message="Senha redefinida com sucesso.")
