from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.users.application.change_password import ChangePassword
from app.users.application.create_user import CreateUser
from app.users.application.delete_user import DeleteUser
from app.users.application.get_user import GetUser
from app.users.application.list_users import ListUsers
from app.users.application.update_user import UpdateUser
from app.users.domain.exceptions import (
    CannotDeleteCurrentUserError,
    InvalidCredentialsError,
    InvalidUserEmailError,
    InvalidUserNameError,
    InvalidUserRoleError,
    PasswordMismatchError,
    UserAccessDeniedError,
    UserEmailAlreadyExistsError,
    UserNotFoundError,
)
from app.users.domain.user import User
from app.users.presentation.dependencies import (
    get_change_password,
    get_create_user,
    get_current_user,
    get_delete_user,
    get_list_users,
    get_update_user,
    get_user_by_id,
)
from app.users.presentation.schemas import (
    ChangePasswordRequest,
    CreateUserRequest,
    MessageResponse,
    UpdateUserRequest,
    UserListResponse,
    UserResponse,
)

router = APIRouter(prefix="/users", tags=["Users"])


def to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        status=user.status,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: CreateUserRequest,
    use_case: Annotated[CreateUser, Depends(get_create_user)],
) -> UserResponse:
    try:
        return to_response(await use_case.execute(**data.model_dump()))
    except UserEmailAlreadyExistsError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except InvalidUserRoleError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error


@router.get("", response_model=UserListResponse)
async def list_users(
    current_user: Annotated[User, Depends(get_current_user)],
    use_case: Annotated[ListUsers, Depends(get_list_users)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> UserListResponse:
    try:
        users, total = await use_case.execute(current_user, offset, limit)
    except UserAccessDeniedError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    return UserListResponse(
        items=[to_response(user) for user in users],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    return to_response(current_user)


@router.post("/me/password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    use_case: Annotated[ChangePassword, Depends(get_change_password)],
) -> MessageResponse:
    try:
        await use_case.execute(
            current_user,
            data.current_password,
            data.new_password,
            data.new_password_confirmation,
        )
    except InvalidCredentialsError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    except PasswordMismatchError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    return MessageResponse(message="Senha alterada com sucesso.")


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    use_case: Annotated[GetUser, Depends(get_user_by_id)],
) -> UserResponse:
    try:
        return to_response(await use_case.execute(current_user, user_id))
    except UserNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except UserAccessDeniedError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    data: UpdateUserRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    use_case: Annotated[UpdateUser, Depends(get_update_user)],
) -> UserResponse:
    try:
        updated = await use_case.execute(
            current_user,
            user_id,
            **data.model_dump(exclude_unset=True),
        )
        return to_response(updated)
    except UserNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except UserAccessDeniedError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    except UserEmailAlreadyExistsError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except (InvalidUserNameError, InvalidUserEmailError, InvalidUserRoleError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    use_case: Annotated[DeleteUser, Depends(get_delete_user)],
) -> None:
    try:
        await use_case.execute(current_user, user_id)
    except UserNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except UserAccessDeniedError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    except CannotDeleteCurrentUserError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
