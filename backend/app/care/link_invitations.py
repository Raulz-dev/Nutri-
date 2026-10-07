from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.care.models import CareAssignmentModel, CareLinkInvitationModel
from app.care.policies import audit, lock_users, utcnow
from app.care.router import AssignmentResponse
from app.config.settings import get_settings
from app.database.session import get_db
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/care-link-invitations", tags=["Care"])


class InvitePatientRequest(BaseModel):
    patient_email: EmailStr


class LinkInvitationItem(BaseModel):
    id: UUID
    patient_id: UUID
    patient_name: str
    nutritionist_id: UUID
    nutritionist_name: str
    expires_at: datetime


def pending(invitation: CareLinkInvitationModel) -> bool:
    return (
        invitation.accepted_at is None
        and invitation.declined_at is None
        and invitation.canceled_at is None
        and invitation.expires_at > utcnow()
    )


def to_item(invitation: CareLinkInvitationModel, patient: UserModel, nutritionist: UserModel):
    return LinkInvitationItem(
        id=invitation.id,
        patient_id=patient.id,
        patient_name=patient.name,
        nutritionist_id=nutritionist.id,
        nutritionist_name=nutritionist.name,
        expires_at=invitation.expires_at,
    )


@router.post("", response_model=LinkInvitationItem, status_code=201)
async def invite_patient(
    data: InvitePatientRequest,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError("Apenas nutricionistas podem convidar pacientes.")
    email = data.patient_email.strip().lower()
    found = await db.scalar(select(UserModel.id).where(func.lower(UserModel.email) == email))
    if found is None:
        raise HTTPException(404, "Paciente não encontrado.")
    users = await lock_users(db, found)
    nutritionist, patient = users[actor.id], users.get(found)
    if nutritionist.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError("Acesso não autorizado.")
    if (
        patient is None
        or patient.role != UserRole.PATIENT
        or patient.email.lower() != email
        or patient.status != UserStatus.ACTIVE
        or patient.deactivated_at
    ):
        raise UserConflictError("Paciente indisponível para convite.")
    if await db.scalar(
        select(CareAssignmentModel.id)
        .where(CareAssignmentModel.patient_id == patient.id, CareAssignmentModel.ended_at.is_(None))
        .limit(1)
    ):
        raise UserConflictError("Paciente já possui vínculo ativo.")
    previous = await db.scalar(
        select(CareLinkInvitationModel)
        .where(
            CareLinkInvitationModel.patient_id == patient.id,
            CareLinkInvitationModel.nutritionist_id == nutritionist.id,
            CareLinkInvitationModel.accepted_at.is_(None),
            CareLinkInvitationModel.declined_at.is_(None),
            CareLinkInvitationModel.canceled_at.is_(None),
        )
        .with_for_update()
    )
    if previous and pending(previous):
        return to_item(previous, patient, nutritionist)
    if previous:
        previous.canceled_at = utcnow()
        await db.flush()
    invitation = CareLinkInvitationModel(
        patient_id=patient.id,
        nutritionist_id=nutritionist.id,
        expires_at=utcnow() + timedelta(days=get_settings().care_invitation_expiration_days),
    )
    db.add(invitation)
    await db.flush()
    audit(db, "invite_patient", "care_link_invitation", invitation.id)
    return to_item(invitation, patient, nutritionist)


@router.get("", response_model=list[LinkInvitationItem])
async def list_invitations(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role not in (UserRole.PATIENT, UserRole.NUTRITIONIST):
        raise UserAccessDeniedError("Acesso não autorizado.")
    patient = aliased(UserModel)
    nutritionist = aliased(UserModel)
    query = (
        select(CareLinkInvitationModel, patient, nutritionist)
        .join(patient, patient.id == CareLinkInvitationModel.patient_id)
        .join(nutritionist, nutritionist.id == CareLinkInvitationModel.nutritionist_id)
        .where(
            CareLinkInvitationModel.accepted_at.is_(None),
            CareLinkInvitationModel.declined_at.is_(None),
            CareLinkInvitationModel.canceled_at.is_(None),
            CareLinkInvitationModel.expires_at > utcnow(),
            patient.status == UserStatus.ACTIVE,
            patient.deactivated_at.is_(None),
            nutritionist.status == UserStatus.ACTIVE,
            nutritionist.deactivated_at.is_(None),
        )
        .order_by(CareLinkInvitationModel.created_at.desc())
    )
    if actor.role == UserRole.PATIENT:
        query = query.where(CareLinkInvitationModel.patient_id == actor.id)
    else:
        query = query.where(CareLinkInvitationModel.nutritionist_id == actor.id)
    rows = (await db.execute(query)).all()
    return [
        to_item(invitation, patient, nutritionist) for invitation, patient, nutritionist in rows
    ]


@router.post("/{invitation_id}/accept", response_model=AssignmentResponse, status_code=201)
async def accept_invitation(
    invitation_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role != UserRole.PATIENT:
        raise UserAccessDeniedError("Apenas pacientes podem aceitar convites.")
    invitation = await db.get(CareLinkInvitationModel, invitation_id)
    if invitation is None or invitation.patient_id != actor.id:
        raise HTTPException(404, "Convite não encontrado.")
    users = await lock_users(db, invitation.nutritionist_id)
    patient, nutritionist = users[actor.id], users.get(invitation.nutritionist_id)
    invitation = await db.scalar(
        select(CareLinkInvitationModel)
        .where(CareLinkInvitationModel.id == invitation_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if not invitation or not pending(invitation):
        raise UserConflictError("Convite indisponível.")
    if (
        patient.role != UserRole.PATIENT
        or not nutritionist
        or nutritionist.role != UserRole.NUTRITIONIST
        or nutritionist.status != UserStatus.ACTIVE
        or nutritionist.deactivated_at
    ):
        raise UserConflictError("Convite indisponível.")
    if await db.scalar(
        select(CareAssignmentModel.id)
        .where(CareAssignmentModel.patient_id == actor.id, CareAssignmentModel.ended_at.is_(None))
        .limit(1)
    ):
        raise UserConflictError("Paciente já possui vínculo ativo.")
    link = CareAssignmentModel(
        patient_id=actor.id, nutritionist_id=nutritionist.id, actor_id=actor.id
    )
    db.add(link)
    invitation.accepted_at = utcnow()
    await db.execute(
        update(CareLinkInvitationModel)
        .where(
            CareLinkInvitationModel.patient_id == actor.id,
            CareLinkInvitationModel.id != invitation_id,
            CareLinkInvitationModel.accepted_at.is_(None),
            CareLinkInvitationModel.declined_at.is_(None),
            CareLinkInvitationModel.canceled_at.is_(None),
        )
        .values(canceled_at=utcnow())
    )
    await db.flush()
    audit(db, "accept_patient_invitation", "care_assignment", link.id)
    return AssignmentResponse(
        patient_id=actor.id, nutritionist_id=nutritionist.id, started_at=link.started_at
    )


@router.post("/{invitation_id}/decline", status_code=204)
async def decline_invitation(
    invitation_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role != UserRole.PATIENT:
        raise UserAccessDeniedError("Apenas pacientes podem recusar convites.")
    invitation = await db.get(CareLinkInvitationModel, invitation_id)
    if invitation is None or invitation.patient_id != actor.id:
        raise HTTPException(404, "Convite não encontrado.")
    await lock_users(db, actor.id)
    invitation = await db.scalar(
        select(CareLinkInvitationModel)
        .where(CareLinkInvitationModel.id == invitation_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if not invitation or not pending(invitation):
        raise UserConflictError("Convite indisponível.")
    invitation.declined_at = utcnow()
    audit(db, "decline_patient_invitation", "care_link_invitation", invitation.id)


@router.delete("/{invitation_id}", status_code=204)
async def cancel_invitation(
    invitation_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError("Apenas nutricionistas podem cancelar convites.")
    invitation = await db.get(CareLinkInvitationModel, invitation_id)
    if invitation is None or invitation.nutritionist_id != actor.id:
        raise HTTPException(404, "Convite não encontrado.")
    await lock_users(db, invitation.patient_id)
    invitation = await db.scalar(
        select(CareLinkInvitationModel)
        .where(CareLinkInvitationModel.id == invitation_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if not invitation or not pending(invitation):
        raise UserConflictError("Convite indisponível.")
    invitation.canceled_at = utcnow()
    audit(db, "cancel_patient_invitation", "care_link_invitation", invitation.id)
