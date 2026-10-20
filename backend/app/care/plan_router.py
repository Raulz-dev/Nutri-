from datetime import date, datetime, timedelta
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.plan_models import MealPlanModel
from app.care.plan_schemas import (
    MealPlanPage,
    MealPlanResponse,
    PlanContent,
    PlanMeal,
    PlanRevision,
    PlanUpdate,
)
from app.care.policies import audit, clinical_reader, clinical_writer, utcnow
from app.database.session import get_db
from app.users.domain.enums import UserRole
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
from app.users.domain.user import User
from app.users.presentation.dependencies import get_current_user

router = APIRouter(tags=["Planos alimentares"])


def local_today() -> date:
    return datetime.now(ZoneInfo("America/Fortaleza")).date()


def to_response(row: MealPlanModel) -> MealPlanResponse:
    return MealPlanResponse(
        id=row.id,
        patient_id=row.patient_id,
        author_id=row.author_id,
        author_name=row.author_name,
        title=row.title,
        start_on=row.start_on,
        end_on=row.end_on,
        effective_end_on=row.effective_end_on,
        water_liters=float(row.water_liters),
        guidance=row.guidance,
        meals=[PlanMeal.model_validate(meal) for meal in row.meals],
        status=row.status,
        revision=row.revision,
        created_at=row.created_at,
        updated_at=row.updated_at,
        published_at=row.published_at,
        closed_at=row.closed_at,
    )


def apply_content(row: MealPlanModel, data: PlanContent):
    row.title = data.title
    row.start_on = data.start_on
    row.end_on = data.end_on
    row.water_liters = data.water_liters
    row.guidance = data.guidance.strip()
    row.meals = [meal.model_dump(mode="json") for meal in data.meals]


async def owned_draft(db: AsyncSession, patient_id: UUID, plan_id: UUID, actor_id: UUID):
    row = await db.get(MealPlanModel, plan_id)
    if row is None or row.patient_id != patient_id:
        raise HTTPException(404, "Plano não encontrado.")
    if row.status != "draft" or row.author_id != actor_id:
        raise UserConflictError("Somente o autor pode alterar um rascunho. Crie uma nova versão.")
    return row


def check_revision(row: MealPlanModel, expected_revision: int):
    if row.revision != expected_revision:
        raise UserConflictError("O plano foi alterado. Recarregue antes de continuar.")


@router.get("/patients/{patient_id}/plans/current", response_model=MealPlanResponse | None)
async def current_plan(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_reader(db, actor, patient_id)
    today = local_today()
    row = await db.scalar(
        select(MealPlanModel)
        .where(
            MealPlanModel.patient_id == patient_id,
            MealPlanModel.status == "published",
            MealPlanModel.start_on <= today,
            MealPlanModel.effective_end_on >= today,
        )
        .order_by(MealPlanModel.published_at.desc(), MealPlanModel.id.desc())
        .limit(1)
    )
    return to_response(row) if row else None


@router.get("/patients/{patient_id}/plans", response_model=MealPlanPage)
async def list_plans(
    patient_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
):
    if actor.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError(
            "Somente o nutricionista responsável pode consultar o histórico."
        )
    await clinical_reader(db, actor, patient_id)
    filtered = select(MealPlanModel).where(
        MealPlanModel.patient_id == patient_id,
        (MealPlanModel.status != "draft") | (MealPlanModel.author_id == actor.id),
    )
    total = await db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    rows = (
        await db.scalars(
            filtered.order_by(MealPlanModel.created_at.desc(), MealPlanModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return MealPlanPage(
        items=[to_response(row) for row in rows], total=total, offset=offset, limit=limit
    )


@router.post("/patients/{patient_id}/plans", response_model=MealPlanResponse, status_code=201)
async def create_plan(
    patient_id: UUID,
    data: PlanContent,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    nutritionist = await clinical_writer(db, actor, patient_id)
    row = MealPlanModel(
        patient_id=patient_id,
        author_id=actor.id,
        author_name=nutritionist.name,
        status="draft",
        revision=1,
    )
    apply_content(row, data)
    db.add(row)
    await db.flush()
    audit(db, "create_meal_plan", "meal_plan", row.id, patient_id=str(patient_id))
    return to_response(row)


@router.put("/patients/{patient_id}/plans/{plan_id}", response_model=MealPlanResponse)
async def update_plan(
    patient_id: UUID,
    plan_id: UUID,
    data: PlanUpdate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_writer(db, actor, patient_id)
    row = await owned_draft(db, patient_id, plan_id, actor.id)
    check_revision(row, data.expected_revision)
    apply_content(row, data)
    row.revision += 1
    await db.flush()
    await db.refresh(row)
    audit(db, "update_meal_plan", "meal_plan", row.id, revision=row.revision)
    return to_response(row)


@router.post("/patients/{patient_id}/plans/{plan_id}/publish", response_model=MealPlanResponse)
async def publish_plan(
    patient_id: UUID,
    plan_id: UUID,
    data: PlanRevision,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_writer(db, actor, patient_id)
    row = await owned_draft(db, patient_id, plan_id, actor.id)
    check_revision(row, data.expected_revision)
    today = local_today()
    if row.end_on < today:
        raise UserConflictError("A validade do plano já terminou.")
    effective_start = max(row.start_on, today)
    cutoff = effective_start - timedelta(days=1)
    published = (
        await db.scalars(
            select(MealPlanModel)
            .where(
                MealPlanModel.patient_id == patient_id,
                MealPlanModel.status == "published",
            )
            .with_for_update()
        )
    ).all()
    for previous in published:
        if previous.start_on > today:
            previous.status = "closed"
            previous.closed_at = utcnow()
            previous.revision += 1
        elif previous.start_on <= today <= previous.end_on and previous.effective_end_on >= today:
            previous.effective_end_on = min(previous.end_on, cutoff)
            previous.revision += 1
    row.status = "published"
    row.effective_end_on = row.end_on
    row.published_at = utcnow()
    row.revision += 1
    await db.flush()
    await db.refresh(row)
    audit(db, "publish_meal_plan", "meal_plan", row.id, patient_id=str(patient_id))
    return to_response(row)


@router.post("/patients/{patient_id}/plans/{plan_id}/close", response_model=MealPlanResponse)
async def close_plan(
    patient_id: UUID,
    plan_id: UUID,
    data: PlanRevision,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_writer(db, actor, patient_id)
    row = await db.get(MealPlanModel, plan_id)
    if row is None or row.patient_id != patient_id:
        raise HTTPException(404, "Plano não encontrado.")
    check_revision(row, data.expected_revision)
    if row.status != "published":
        raise UserConflictError("Somente planos publicados podem ser encerrados.")
    today = local_today()
    row.status = "closed"
    row.closed_at = utcnow()
    row.revision += 1
    if row.start_on > today:
        current = await db.scalar(
            select(MealPlanModel)
            .where(
                MealPlanModel.patient_id == patient_id,
                MealPlanModel.status == "published",
                MealPlanModel.start_on <= today,
                MealPlanModel.end_on >= today,
            )
            .order_by(MealPlanModel.published_at.desc())
            .limit(1)
            .with_for_update()
        )
        if current:
            current.effective_end_on = current.end_on
            current.revision += 1
    await db.flush()
    await db.refresh(row)
    audit(db, "close_meal_plan", "meal_plan", row.id, patient_id=str(patient_id))
    return to_response(row)
