import json
from datetime import datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.models import EmailOutboxModel, InvitationModel
from app.care.policies import audit, lock_users, require_admin, utcnow
from app.config.settings import get_settings
from app.database.session import get_db
from app.security.password import PasswordHasher
from app.security.tokens import create_opaque_token, hash_token
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserConflictError
from app.users.domain.user import User
from app.users.infrastructure.models import RefreshSessionModel, UserModel
from app.users.presentation.dependencies import get_current_user
from app.users.presentation.router import to_response
from app.users.presentation.schemas import UserResponse

router = APIRouter(tags=["Invitations"])


class InviteRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr


class AcceptInviteRequest(BaseModel):
    token: str = Field(min_length=32)
    password: str = Field(min_length=8, max_length=128)
    password_confirmation: str = Field(min_length=8, max_length=128)


class InvitationDeliveryStatus(BaseModel):
    user_id: UUID
    status: Literal["pending", "sent", "failed", "expired"]
    resend_available_at: datetime | None = None


RESEND_INTERVAL = timedelta(hours=1)


def delivery_status(
    invitation: InvitationModel, outbox: EmailOutboxModel, now: datetime
) -> InvitationDeliveryStatus:
    if invitation.expires_at <= now:
        status = "expired"
    elif outbox.failed_at:
        status = "failed"
    elif outbox.delivered_at:
        status = "sent"
    else:
        status = "pending"
    return InvitationDeliveryStatus(
        user_id=invitation.user_id,
        status=status,
        resend_available_at=(outbox.delivered_at + RESEND_INTERVAL if status == "sent" else None),
    )


def cipher():
    key = get_settings().outbox_encryption_key
    if not key:
        raise RuntimeError("OUTBOX_ENCRYPTION_KEY não configurada.")
    return Fernet(key.encode())


async def queue_invitation(db: AsyncSession, user: UserModel):
    token = create_opaque_token()
    invitation = InvitationModel(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=utcnow() + timedelta(hours=get_settings().invitation_expiration_hours),
    )
    db.add(invitation)
    await db.flush()
    payload = json.dumps({"recipient": user.email, "token": token})
    db.add(
        EmailOutboxModel(
            invitation_id=invitation.id,
            payload=cipher().encrypt(payload.encode()).decode(),
            attempts=0,
        )
    )


@router.post("/admin/invitations", response_model=UserResponse, status_code=201)
async def invite(
    data: InviteRequest,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    require_admin(actor)
    users = await lock_users(db, actor.id)
    if users[actor.id].role != UserRole.ADMIN:
        raise HTTPException(403, "Acesso não autorizado.")
    normalized = data.email.strip().lower()
    if await db.scalar(select(UserModel.id).where(UserModel.email == normalized)):
        raise UserConflictError("E-mail já cadastrado.")
    user = User(
        name=data.name,
        email=normalized,
        password_hash=PasswordHasher().hash(create_opaque_token()),
        role=UserRole.NUTRITIONIST,
        status=UserStatus.BLOCKED,
    )
    model = UserModel(
        id=user.id,
        name=user.name,
        email=user.email,
        password_hash=user.password_hash,
        role=user.role,
        status=user.status,
    )
    db.add(model)
    try:
        await db.flush()
    except IntegrityError as error:
        raise UserConflictError("E-mail já cadastrado.") from error
    await queue_invitation(db, model)
    audit(db, "invite", "user", model.id, role="nutritionist")
    return to_response(user)


@router.get("/admin/invitations/statuses", response_model=list[InvitationDeliveryStatus])
async def list_delivery_statuses(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    require_admin(actor)
    rows = (
        await db.execute(
            select(InvitationModel, EmailOutboxModel)
            .join(EmailOutboxModel, EmailOutboxModel.invitation_id == InvitationModel.id)
            .where(InvitationModel.used_at.is_(None))
            .order_by(InvitationModel.user_id, InvitationModel.id.desc())
        )
    ).all()
    result = []
    seen = set()
    now = utcnow()
    for invitation, outbox in rows:
        if invitation.user_id not in seen:
            result.append(delivery_status(invitation, outbox, now))
            seen.add(invitation.user_id)
    return result


@router.post("/admin/invitations/{user_id}/resend", response_model=UserResponse)
async def resend(
    user_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    require_admin(actor)
    users = await lock_users(db, user_id)
    target = users.get(user_id)
    if users[actor.id].role != UserRole.ADMIN or not target or target.deactivated_at:
        raise UserConflictError("Conta indisponível para convite.")
    if target.role != UserRole.NUTRITIONIST or target.status != UserStatus.BLOCKED:
        raise UserConflictError("Conta indisponível para convite.")
    if target.credentials_changed_at:
        raise UserConflictError("O profissional já concluiu o primeiro acesso.")
    previous = (
        await db.scalars(
            select(InvitationModel)
            .where(InvitationModel.user_id == user_id, InvitationModel.used_at.is_(None))
            .with_for_update()
        )
    ).all()
    if not previous:
        raise UserConflictError("A conta não possui convite pendente.")
    latest = max(previous, key=lambda invitation: invitation.id)
    outbox = await db.scalar(
        select(EmailOutboxModel)
        .where(EmailOutboxModel.invitation_id == latest.id)
        .with_for_update()
    )
    if outbox is None:
        raise UserConflictError("Envio do convite não encontrado.")
    current = delivery_status(latest, outbox, utcnow())
    if current.status == "pending":
        raise UserConflictError("Aguarde a confirmação do envio antes de reenviar.")
    if current.resend_available_at and current.resend_available_at > utcnow():
        raise UserConflictError("O convite poderá ser reenviado uma hora após o envio.")
    for invitation in previous:
        invitation.used_at = utcnow()
    await db.execute(
        update(EmailOutboxModel)
        .where(
            EmailOutboxModel.invitation_id.in_([invitation.id for invitation in previous]),
            EmailOutboxModel.delivered_at.is_(None),
        )
        .values(payload=None, failed_at=utcnow())
    )
    await queue_invitation(db, target)
    audit(db, "resend_invitation", "user", target.id)
    return UserResponse(
        id=target.id, name=target.name, email=target.email, role=target.role, status=target.status
    )


@router.post("/auth/invitations/accept", response_model=UserResponse)
async def accept(
    data: AcceptInviteRequest, db: Annotated[AsyncSession, Depends(get_db, scope="function")]
):
    if data.password != data.password_confirmation:
        raise HTTPException(422, "A confirmação da senha não corresponde.")
    invitation = await db.scalar(
        select(InvitationModel).where(InvitationModel.token_hash == hash_token(data.token))
    )
    if not invitation or invitation.used_at or invitation.expires_at <= utcnow():
        raise HTTPException(422, "Convite inválido ou expirado.")
    users = await lock_users(db, invitation.user_id)
    user = users.get(invitation.user_id)
    invitation = await db.scalar(
        select(InvitationModel).where(InvitationModel.id == invitation.id).with_for_update()
    )
    if invitation.used_at or invitation.expires_at <= utcnow():
        raise HTTPException(422, "Convite inválido ou expirado.")
    if (
        not user
        or user.deactivated_at
        or user.status != UserStatus.BLOCKED
        or user.role != UserRole.NUTRITIONIST
    ):
        raise HTTPException(422, "Convite inválido ou expirado.")
    user.password_hash = PasswordHasher().hash(data.password)
    user.status = UserStatus.ACTIVE
    user.credentials_changed_at = utcnow()
    invitation.used_at = utcnow()
    await db.execute(
        update(RefreshSessionModel)
        .where(RefreshSessionModel.user_id == user.id, RefreshSessionModel.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    audit(db, "accept_invitation", "user", user.id, actor_override=user.id)
    return UserResponse(
        id=user.id, name=user.name, email=user.email, role=user.role, status=user.status
    )
