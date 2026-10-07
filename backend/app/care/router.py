from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.models import CareAssignmentModel, CareLinkInvitationModel
from app.care.policies import audit, lock_users, require_admin, utcnow
from app.database.session import get_db
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.presentation.dependencies import get_current_user

router = APIRouter(tags=["Care"])


class AssignmentInput(BaseModel):
    nutritionist_id: UUID


class AssignmentResponse(BaseModel):
    patient_id: UUID
    nutritionist_id: UUID
    started_at: datetime


class PatientRow(BaseModel):
    id: UUID
    name: str
    email: str
    status: UserStatus
    deactivated_at: datetime | None = None
    nutritionist_id: UUID | None = None
    nutritionist_name: str | None = None


class PatientList(BaseModel):
    items: list[PatientRow]
    total: int
    offset: int
    limit: int


async def current_assignment(db: AsyncSession, patient_id: UUID, lock=False):
    query = select(CareAssignmentModel).where(
        CareAssignmentModel.patient_id == patient_id, CareAssignmentModel.ended_at.is_(None)
    )
    if lock:
        query = query.with_for_update()
    return await db.scalar(query)


async def require_patient_access(db: AsyncSession, actor: User, patient_id: UUID):
    patient = await db.get(UserModel, patient_id)
    if patient is None or patient.role != UserRole.PATIENT or patient.deactivated_at:
        raise HTTPException(404, "Paciente não encontrado.")
    if actor.role == UserRole.ADMIN or actor.id == patient_id:
        return patient
    if actor.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError("Acesso não autorizado.")
    link = await current_assignment(db, patient_id)
    if link is None or link.nutritionist_id != actor.id:
        raise UserAccessDeniedError("Paciente não vinculado a você.")
    return patient


@router.get("/patients", response_model=PatientList)
async def patients(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: str = Query("", max_length=100),
    include_deactivated: bool = False,
):
    if actor.role not in (UserRole.ADMIN, UserRole.NUTRITIONIST):
        raise UserAccessDeniedError("Acesso não autorizado.")
    if include_deactivated and actor.role != UserRole.ADMIN:
        raise UserAccessDeniedError("Acesso não autorizado.")
    from sqlalchemy.orm import aliased

    nutritionist = aliased(UserModel)
    query = (
        select(UserModel, CareAssignmentModel, nutritionist.name)
        .outerjoin(
            CareAssignmentModel,
            (CareAssignmentModel.patient_id == UserModel.id)
            & CareAssignmentModel.ended_at.is_(None),
        )
        .outerjoin(nutritionist, nutritionist.id == CareAssignmentModel.nutritionist_id)
        .where(UserModel.role == UserRole.PATIENT)
    )
    if not include_deactivated:
        query = query.where(UserModel.deactivated_at.is_(None))
    if actor.role == UserRole.NUTRITIONIST:
        query = query.where(CareAssignmentModel.nutritionist_id == actor.id)
    if q.strip():
        term = f"%{q.strip().replace('%', r'\%').replace('_', r'\_')}%"
        query = query.where(
            or_(UserModel.name.ilike(term, escape="\\"), UserModel.email.ilike(term, escape="\\"))
        )
    count = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.execute(query.order_by(UserModel.name, UserModel.id).offset(offset).limit(limit))
    ).all()
    return PatientList(
        items=[
            PatientRow(
                id=u.id,
                name=u.name,
                email=u.email,
                status=u.status,
                deactivated_at=u.deactivated_at,
                nutritionist_id=link.nutritionist_id if link else None,
                nutritionist_name=name,
            )
            for u, link, name in rows
        ],
        total=count or 0,
        offset=offset,
        limit=limit,
    )


@router.get("/patients/{patient_id}", response_model=PatientRow)
async def patient_detail(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    patient = await require_patient_access(db, actor, patient_id)
    link = await current_assignment(db, patient_id)
    nutritionist = await db.get(UserModel, link.nutritionist_id) if link else None
    return PatientRow(
        id=patient.id,
        name=patient.name,
        email=patient.email,
        status=patient.status,
        deactivated_at=patient.deactivated_at,
        nutritionist_id=link.nutritionist_id if link else None,
        nutritionist_name=nutritionist.name if nutritionist else None,
    )


@router.put("/patients/{patient_id}/assignment", response_model=AssignmentResponse)
async def assign(
    patient_id: UUID,
    data: AssignmentInput,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    require_admin(actor)
    users = await lock_users(db, patient_id, data.nutritionist_id)
    require_admin(users[actor.id])
    patient, nutritionist = users.get(patient_id), users.get(data.nutritionist_id)
    if (
        not patient
        or patient.role != UserRole.PATIENT
        or patient.deactivated_at
        or patient.status != UserStatus.ACTIVE
    ):
        raise UserConflictError("Paciente indisponível para vínculo.")
    if (
        not nutritionist
        or nutritionist.role != UserRole.NUTRITIONIST
        or nutritionist.deactivated_at
        or nutritionist.status != UserStatus.ACTIVE
    ):
        raise UserConflictError("Nutricionista indisponível para vínculo.")
    current = await current_assignment(db, patient_id, lock=True)
    if current and current.nutritionist_id == nutritionist.id:
        return AssignmentResponse(
            patient_id=patient_id, nutritionist_id=nutritionist.id, started_at=current.started_at
        )
    if current:
        current.ended_at = utcnow()
        await db.flush()
    link = CareAssignmentModel(
        patient_id=patient_id, nutritionist_id=nutritionist.id, actor_id=actor.id
    )
    db.add(link)
    await db.flush()
    await db.execute(
        update(CareLinkInvitationModel)
        .where(
            CareLinkInvitationModel.patient_id == patient_id,
            CareLinkInvitationModel.accepted_at.is_(None),
            CareLinkInvitationModel.declined_at.is_(None),
            CareLinkInvitationModel.canceled_at.is_(None),
        )
        .values(canceled_at=utcnow())
    )
    audit(
        db,
        "assign" if not current else "transfer",
        "care_assignment",
        link.id,
        patient_id=str(patient_id),
        nutritionist_id=str(nutritionist.id),
    )
    return AssignmentResponse(
        patient_id=patient_id, nutritionist_id=nutritionist.id, started_at=link.started_at
    )


@router.delete("/patients/{patient_id}/assignment", status_code=204)
async def unassign(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    require_admin(actor)
    users = await lock_users(db, patient_id)
    require_admin(users[actor.id])
    current = await current_assignment(db, patient_id, lock=True)
    if current is None:
        raise HTTPException(404, "Vínculo não encontrado.")
    current.ended_at = utcnow()
    audit(db, "unassign", "care_assignment", current.id, patient_id=str(patient_id))
