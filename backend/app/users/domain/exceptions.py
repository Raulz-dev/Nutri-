class UserError(Exception):
    pass


class InvalidUserNameError(UserError):
    pass


class InvalidUserEmailError(UserError):
    pass


class InvalidUserPasswordError(UserError):
    pass


class InvalidUserRoleError(UserError):
    pass


class InvalidUserStatusError(UserError):
    pass


class UserEmailAlreadyExistsError(UserError):
    pass


class UserNotFoundError(UserError):
    pass


class InvalidCredentialsError(UserError):
    pass


class UserBlockedError(UserError):
    pass


class InvalidRefreshTokenError(UserError):
    pass


class InvalidPasswordResetTokenError(UserError):
    pass


class PasswordMismatchError(UserError):
    pass


class UserAccessDeniedError(UserError):
    pass


class CannotDeleteCurrentUserError(UserError):
    pass
