from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

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


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    use_case: Annotated[LoginUser, Depends(get_login_user)],
) -> TokenResponse:
    try:
        tokens = await use_case.execute(data.email, data.password)
    except InvalidCredentialsError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"},
        ) from error
    except UserBlockedError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    data: RefreshRequest,
    use_case: Annotated[RefreshAccess, Depends(get_refresh_access)],
) -> TokenResponse:
    try:
        tokens = await use_case.execute(data.refresh_token)
    except InvalidRefreshTokenError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    data: LogoutRequest,
    use_case: Annotated[LogoutUser, Depends(get_logout_user)],
) -> None:
    await use_case.execute(data.refresh_token)


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
