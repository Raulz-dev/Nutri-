from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.clinical_models import (
    FollowUpModel,
    MeasurementModel,
    PatientIntakeRevisionModel,
    WeightGoalRevisionModel,
)
from app.care.policies import audit, lock_users
from app.care.router import current_assignment, require_patient_access
from app.database.session import get_db
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.presentation.dependencies import get_current_user

router = APIRouter(tags=["Acompanhamento"])
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
ShortText = Annotated[str, StringConstraints(max_length=300)]


class IntakeGoal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primary: Literal[
        "weight-loss", "muscle-gain", "food-education", "performance", "clinical-control", "other"
    ]
    details: str = Field(max_length=200)


class IntakeFood(BaseModel):
    model_config = ConfigDict(extra="forbid")
    liked: list[Tag] = Field(max_length=20)
    disliked: list[Tag] = Field(max_length=20)
    avoided: list[Tag] = Field(max_length=20)
    pattern: Literal["", "omnivore", "vegetarian", "vegan", "pescatarian", "other"]
    otherPattern: str = Field(max_length=80)

    @model_validator(mode="after")
    def other_pattern_only_when_selected(self):
        if self.pattern != "other" and self.otherPattern.strip():
            raise ValueError("Outro padrão exige a opção correspondente.")
        return self


class IntakeRestrictions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allergies: list[Tag] = Field(max_length=10)
    noAllergies: bool
    intolerances: list[Tag] = Field(max_length=10)
    noIntolerances: bool
    other: ShortText

    @model_validator(mode="after")
    def no_conflicting_flags(self):
        if self.noAllergies and self.allergies:
            raise ValueError("Alergias informadas conflitam com sem alergias.")
        if self.noIntolerances and self.intolerances:
            raise ValueError("Intolerâncias informadas conflitam com sem intolerâncias.")
        return self


class IntakeHealth(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conditions: list[Tag] = Field(max_length=10)
    medications: list[Tag] = Field(max_length=20)
    supplements: list[Tag] = Field(max_length=10)
    digestiveSymptoms: ShortText


def optional_step(value: str, low: Decimal, high: Decimal, step: Decimal) -> bool:
    if not value:
        return True
    try:
        number = Decimal(value)
    except ArithmeticError:
        return False
    return number.is_finite() and low <= number <= high and number % step == 0


class IntakeRoutine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mealsPerDay: str = Field(max_length=2)
    eatingSchedule: str = Field(max_length=150)
    waterLiters: str = Field(max_length=4)
    eatingOutFrequency: Literal["", "never", "1-2", "3-5", "daily"]
    difficulties: ShortText

    @model_validator(mode="after")
    def validate_numbers(self):
        if not optional_step(self.mealsPerDay, Decimal(1), Decimal(12), Decimal(1)):
            raise ValueError("Informe entre 1 e 12 refeições inteiras.")
        if not optional_step(self.waterLiters, Decimal(0), Decimal(15), Decimal("0.1")):
            raise ValueError("Informe entre 0 e 15 litros em passos de 0,1.")
        return self


class IntakeLifestyle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    activityType: str = Field(max_length=100)
    activityFrequency: Literal["", "none", "1-2", "3-4", "5-plus"]
    sleepHours: str = Field(max_length=4)
    alcohol: Literal["", "none", "occasional", "weekly", "daily"]
    smoking: Literal["", "never", "former", "current"]

    @model_validator(mode="after")
    def validate_sleep(self):
        if not optional_step(self.sleepHours, Decimal(0), Decimal(24), Decimal("0.5")):
            raise ValueError("Informe entre 0 e 24 horas em passos de 0,5.")
        return self


class PatientIntake(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    goal: IntakeGoal
    food: IntakeFood
    restrictions: IntakeRestrictions
    health: IntakeHealth
    routine: IntakeRoutine
    lifestyle: IntakeLifestyle
    observations: str = Field(max_length=500)

    @field_validator("food", "restrictions", "health")
    @classmethod
    def no_duplicate_tags(cls, group):
        for value in group.model_dump().values():
            if isinstance(value, list) and len({tag.casefold() for tag in value}) != len(value):
                raise ValueError("Itens repetidos não são permitidos no mesmo campo.")
        return group


class IntakeUpdate(BaseModel):
    intake: PatientIntake
    expected_revision: int = Field(ge=0)


class IntakeResponse(BaseModel):
    intake: PatientIntake | None
    revision: int
    author_id: UUID | None = None
    updated_at: datetime | None = None


class WeightGoalUpdate(BaseModel):
    target_kg: Decimal = Field(gt=0, le=500, decimal_places=1)
    expected_revision: int = Field(ge=0)


class WeightGoalResponse(BaseModel):
    target_kg: Decimal | None
    revision: int
    author_id: UUID | None = None
    author_name: str | None = None
    updated_at: datetime | None = None

    @field_serializer("target_kg", when_used="json")
    def serialize_target(self, value: Decimal | None):
        return float(value) if value is not None else None


class MeasurementCreate(BaseModel):
    measured_on: date
    weight_kg: Decimal = Field(gt=0, le=500, decimal_places=1)
    body_fat_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=1)
    note: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def not_future(self):
        if self.measured_on > date.today():
            raise ValueError("A data da medição não pode ser futura.")
        return self


class MeasurementResponse(BaseModel):
    id: UUID
    patient_id: UUID
    author_id: UUID
    author_name: str
    measured_on: date
    weight_kg: Decimal
    body_fat_pct: Decimal | None
    note: str
    created_at: datetime

    @field_serializer("weight_kg", "body_fat_pct", when_used="json")
    def serialize_measurement(self, value: Decimal | None):
        return float(value) if value is not None else None


class FollowUpCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def non_blank(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Escreva uma avaliação.")
        return value


class FollowUpResponse(BaseModel):
    id: UUID
    patient_id: UUID
    author_id: UUID
    author_name: str
    text: str
    created_at: datetime


class MeasurementPage(BaseModel):
    items: list[MeasurementResponse]
    total: int
    offset: int
    limit: int


class FollowUpPage(BaseModel):
    items: list[FollowUpResponse]
    total: int
    offset: int
    limit: int


async def clinical_reader(db: AsyncSession, actor: User, patient_id: UUID):
    if actor.role == UserRole.ADMIN:
        raise UserAccessDeniedError("Dados de acompanhamento não disponíveis ao administrador.")
    return await require_patient_access(db, actor, patient_id)


async def clinical_writer(db: AsyncSession, actor: User, patient_id: UUID) -> UserModel:
    if actor.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError("Apenas o nutricionista responsável pode registrar avaliações.")
    users = await lock_users(db, patient_id)
    patient = users.get(patient_id)
    if not patient or patient.role != UserRole.PATIENT or patient.deactivated_at:
        raise HTTPException(404, "Paciente não encontrado.")
    if patient.status != UserStatus.ACTIVE:
        raise UserConflictError("Paciente bloqueado para novos registros.")
    assignment = await current_assignment(db, patient_id)
    if not assignment or assignment.nutritionist_id != actor.id:
        raise UserAccessDeniedError("Paciente não vinculado a você.")
    return users[actor.id]


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
