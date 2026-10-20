from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.account_models import ProfessionalProfileModel
from app.care.policies import audit, lock_users
from app.database.session import get_db
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.infrastructure.refresh_session_repository import SQLAlchemyRefreshSessionRepository
from app.users.infrastructure.repository import SQLAlchemyUserRepository
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/account", tags=["Conta"])
Actor = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db, scope="function")]


class ProfessionalProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    name: str = Field(min_length=2, max_length=120)
    crn: str = Field(default="", max_length=80)
    contact: str = Field(default="", max_length=200)
    bio: str = Field(default="", max_length=4000)
    revision: int = Field(ge=1)

    @field_validator("name", "crn", "contact", "bio")
    @classmethod
    def normalize(cls, value: str, info):
        value = value.strip()
        if info.field_name == "name" and len(value) < 2:
            raise ValueError("Informe o nome profissional.")
        return value


@router.get("/professional-profile", response_model=ProfessionalProfile)
async def profile(actor: Actor, db: DB):
    if actor.role != UserRole.NUTRITIONIST:
        raise HTTPException(403, "Acesso não autorizado.")
    row = await db.get(ProfessionalProfileModel, actor.id)
    return row or ProfessionalProfile(name=actor.name, revision=1)


@router.put("/professional-profile", response_model=ProfessionalProfile)
async def save_profile(data: ProfessionalProfile, actor: Actor, db: DB):
    if actor.role != UserRole.NUTRITIONIST:
        raise HTTPException(403, "Acesso não autorizado.")
    locked = await lock_users(db, actor.id)
    if locked[actor.id].role != UserRole.NUTRITIONIST:
        raise HTTPException(403, "Acesso não autorizado.")
    row = await db.get(ProfessionalProfileModel, actor.id)
    if data.revision != (row.revision if row else 1):
        raise HTTPException(409, "O perfil foi alterado. Recarregue antes de salvar.")
    if not row:
        row = ProfessionalProfileModel(user_id=actor.id)
        db.add(row)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    row.revision += 1
    audit(db, "update_professional_profile", "user", actor.id)
    await db.flush()
    return row


class AccountSettings(BaseModel):
    name: str
    email: EmailStr
    email_notifications: bool


class SettingsUpdate(AccountSettings):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=120)
    current_password: str = Field(min_length=1, max_length=128)


@router.get("/settings", response_model=AccountSettings)
async def settings(actor: Actor, db: DB):
    row = await db.get(UserModel, actor.id)
    return AccountSettings(
        name=row.name, email=row.email, email_notifications=row.email_notifications
    )


@router.put("/settings", response_model=AccountSettings)
async def save_settings(data: SettingsUpdate, actor: Actor, db: DB):
    locked = await lock_users(db, actor.id)
    row = locked[actor.id]
    if not PasswordHasher().verify(data.current_password, row.password_hash):
        raise HTTPException(403, "Senha atual inválida.")
    email_changed = row.email != str(data.email).strip().lower()
    actor = SQLAlchemyUserRepository._to_domain(row)
    actor.change_name(data.name)
    actor.change_email(str(data.email))
    if len(actor.name) < 2:
        raise HTTPException(422, "Informe um nome válido.")
    await SQLAlchemyUserRepository(db).update(actor)
    row.email_notifications = data.email_notifications
    if email_changed:
        await SQLAlchemyRefreshSessionRepository(db).revoke_all_for_user(actor.id)
    await db.flush()
    return AccountSettings(
        name=row.name, email=row.email, email_notifications=row.email_notifications
    )
