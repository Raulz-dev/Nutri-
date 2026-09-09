from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    NUTRITIONIST = "nutritionist"
    PATIENT = "patient"


class UserStatus(StrEnum):
    ACTIVE = "active"
    BLOCKED = "blocked"
