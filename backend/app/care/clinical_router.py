from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.clinical_models import (
    FollowUpModel,
    MeasurementModel,
    PatientIntakeRevisionModel,
    WeightGoalRevisionModel,
)
from app.care.clinical_schemas import (
    FollowUpCreate,
    FollowUpPage,
    FollowUpResponse,
    IntakeResponse,
    IntakeUpdate,
    MeasurementCreate,
    MeasurementPage,
    MeasurementResponse,
    PatientIntake,
    WeightGoalResponse,
    WeightGoalUpdate,
)
from app.care.policies import (
    audit,
    clinical_reader,
    clinical_writer,
    lock_users,
    require_patient_access,
)
from app.database.session import get_db
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
from app.users.domain.user import User
from app.users.presentation.dependencies import get_current_user

router = APIRouter(tags=["Acompanhamento"])


@router.get("/patients/{patient_id}/intake", response_model=IntakeResponse)
async def get_intake(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_reader(db, actor, patient_id)
    current = await db.scalar(
        select(PatientIntakeRevisionModel)
        .where(PatientIntakeRevisionModel.patient_id == patient_id)
        .order_by(PatientIntakeRevisionModel.revision.desc())
        .limit(1)
    )
    if not current:
        return IntakeResponse(intake=None, revision=0)
    return IntakeResponse(
        intake=PatientIntake.model_validate(current.data),
        revision=current.revision,
        author_id=current.author_id,
        updated_at=current.created_at,
    )


@router.put("/patients/{patient_id}/intake", response_model=IntakeResponse)
async def put_intake(
    patient_id: UUID,
    data: IntakeUpdate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role != UserRole.PATIENT or actor.id != patient_id:
        raise UserAccessDeniedError("Somente o paciente pode alterar suas preferências.")
    users = await lock_users(db, patient_id)
    if users[patient_id].status != UserStatus.ACTIVE:
        raise UserConflictError("Conta indisponível.")
    current_revision = (
        await db.scalar(
            select(func.max(PatientIntakeRevisionModel.revision)).where(
                PatientIntakeRevisionModel.patient_id == patient_id
            )
        )
        or 0
    )
    if data.expected_revision != current_revision:
        raise UserConflictError("As preferências foram alteradas. Recarregue antes de salvar.")
    row = PatientIntakeRevisionModel(
        patient_id=patient_id,
        revision=current_revision + 1,
        data=data.intake.model_dump(),
        author_id=actor.id,
    )
    db.add(row)
    await db.flush()
    audit(db, "update_intake", "patient_intake", row.id, revision=row.revision)
    return IntakeResponse(
        intake=data.intake,
        revision=row.revision,
        author_id=actor.id,
        updated_at=row.created_at,
    )


@router.get("/patients/{patient_id}/weight-goal", response_model=WeightGoalResponse)
async def get_weight_goal(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_reader(db, actor, patient_id)
    current = await db.scalar(
        select(WeightGoalRevisionModel)
        .where(WeightGoalRevisionModel.patient_id == patient_id)
        .order_by(WeightGoalRevisionModel.revision.desc())
        .limit(1)
    )
    if not current:
        return WeightGoalResponse(target_kg=None, revision=0)
    return WeightGoalResponse(
        target_kg=current.target_kg,
        revision=current.revision,
        author_id=current.author_id,
        author_name=current.author_name,
        updated_at=current.created_at,
    )


@router.put("/patients/{patient_id}/weight-goal", response_model=WeightGoalResponse)
async def put_weight_goal(
    patient_id: UUID,
    data: WeightGoalUpdate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    nutritionist = await clinical_writer(db, actor, patient_id)
    current_revision = (
        await db.scalar(
            select(func.max(WeightGoalRevisionModel.revision)).where(
                WeightGoalRevisionModel.patient_id == patient_id
            )
        )
        or 0
    )
    if data.expected_revision != current_revision:
        raise UserConflictError("A meta foi alterada. Recarregue antes de salvar.")
    row = WeightGoalRevisionModel(
        patient_id=patient_id,
        revision=current_revision + 1,
        target_kg=data.target_kg,
        author_id=actor.id,
        author_name=nutritionist.name,
    )
    db.add(row)
    await db.flush()
    audit(db, "update_weight_goal", "weight_goal", row.id, patient_id=str(patient_id))
    return WeightGoalResponse(
        target_kg=row.target_kg,
        revision=row.revision,
        author_id=row.author_id,
        author_name=row.author_name,
        updated_at=row.created_at,
    )


@router.get("/patients/{patient_id}/measurements", response_model=MeasurementPage)
async def get_measurements(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    await clinical_reader(db, actor, patient_id)
    filtered = select(MeasurementModel).where(MeasurementModel.patient_id == patient_id)
    total = await db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    rows = (
        await db.scalars(
            filtered.order_by(
                MeasurementModel.measured_on.desc(),
                MeasurementModel.created_at.desc(),
                MeasurementModel.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return MeasurementPage(
        items=[MeasurementResponse.model_validate(row, from_attributes=True) for row in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/patients/{patient_id}/measurements", response_model=MeasurementResponse, status_code=201
)
async def add_measurement(
    patient_id: UUID,
    data: MeasurementCreate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    nutritionist = await clinical_writer(db, actor, patient_id)
    row = MeasurementModel(
        patient_id=patient_id,
        author_id=actor.id,
        author_name=nutritionist.name,
        measured_on=data.measured_on,
        weight_kg=data.weight_kg,
        body_fat_pct=data.body_fat_pct,
        note=data.note.strip(),
    )
    db.add(row)
    await db.flush()
    audit(db, "record_measurement", "measurement", row.id, patient_id=str(patient_id))
    return MeasurementResponse.model_validate(row, from_attributes=True)


@router.get("/patients/{patient_id}/follow-ups", response_model=FollowUpPage)
async def get_follow_ups(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    if actor.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError("Apenas nutricionistas podem consultar avaliações.")
    await require_patient_access(db, actor, patient_id)
    filtered = select(FollowUpModel).where(FollowUpModel.patient_id == patient_id)
    total = await db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    rows = (
        await db.scalars(
            filtered.order_by(FollowUpModel.created_at.desc(), FollowUpModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return FollowUpPage(
        items=[FollowUpResponse.model_validate(row, from_attributes=True) for row in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/patients/{patient_id}/follow-ups", response_model=FollowUpResponse, status_code=201)
async def add_follow_up(
    patient_id: UUID,
    data: FollowUpCreate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    nutritionist = await clinical_writer(db, actor, patient_id)
    row = FollowUpModel(
        patient_id=patient_id, author_id=actor.id, author_name=nutritionist.name, text=data.text
    )
    db.add(row)
    await db.flush()
    audit(db, "record_follow_up", "follow_up_note", row.id, patient_id=str(patient_id))
    return FollowUpResponse.model_validate(row, from_attributes=True)


@router.put("/patients/{patient_id}/measurements/{record_id}", response_model=MeasurementResponse)
async def save_measurement(
    patient_id: UUID,
    record_id: UUID,
    data: MeasurementCreate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    nutritionist = await clinical_writer(db, actor, patient_id)
    row = await db.get(MeasurementModel, record_id)
    if row and (row.patient_id != patient_id or row.author_id != actor.id):
        raise HTTPException(404, "Medição não encontrada.")
    action = "update_measurement" if row else "record_measurement"
    if row is None:
        row = MeasurementModel(
            id=record_id, patient_id=patient_id, author_id=actor.id, author_name=nutritionist.name
        )
        db.add(row)
    row.measured_on = data.measured_on
    row.weight_kg = data.weight_kg
    row.body_fat_pct = data.body_fat_pct
    row.note = data.note.strip()
    await db.flush()
    audit(db, action, "measurement", row.id, patient_id=str(patient_id))
    return MeasurementResponse.model_validate(row, from_attributes=True)


@router.put("/patients/{patient_id}/follow-ups/{record_id}", response_model=FollowUpResponse)
async def save_follow_up(
    patient_id: UUID,
    record_id: UUID,
    data: FollowUpCreate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    nutritionist = await clinical_writer(db, actor, patient_id)
    row = await db.get(FollowUpModel, record_id)
    if row and (row.patient_id != patient_id or row.author_id != actor.id):
        raise HTTPException(404, "Avaliação não encontrada.")
    action = "update_follow_up" if row else "record_follow_up"
    if row is None:
        row = FollowUpModel(
            id=record_id, patient_id=patient_id, author_id=actor.id, author_name=nutritionist.name
        )
        db.add(row)
    row.text = data.text
    await db.flush()
    audit(db, action, "follow_up_note", row.id, patient_id=str(patient_id))
    return FollowUpResponse.model_validate(row, from_attributes=True)
