from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)

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
