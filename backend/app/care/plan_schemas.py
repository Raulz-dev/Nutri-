from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class PlanFood(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    name: Name
    grams: float = Field(gt=0, le=5000, allow_inf_nan=False)


class PlanSubstitution(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    foods: list[PlanFood] = Field(min_length=1, max_length=20)


class PlanMeal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    title: Name
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    foods: list[PlanFood] = Field(min_length=1, max_length=20)
    substitutions: list[PlanSubstitution] = Field(max_length=5)
    calories: float = Field(ge=0, le=10000, allow_inf_nan=False)
    protein: float = Field(ge=0, le=10000, allow_inf_nan=False)
    carbs: float = Field(ge=0, le=10000, allow_inf_nan=False)
    fats: float = Field(ge=0, le=10000, allow_inf_nan=False)

    @model_validator(mode="after")
    def unique_option_ids(self):
        ids = [food.id for food in self.foods]
        ids.extend(option.id for option in self.substitutions)
        ids.extend(food.id for option in self.substitutions for food in option.foods)
        if len(ids) != len(set(ids)):
            raise ValueError("Identificadores de alimentos e substituições devem ser distintos.")
        return self


class PlanContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Name
    start_on: date
    end_on: date
    water_liters: float = Field(ge=0, le=15, allow_inf_nan=False)
    guidance: str = Field(max_length=2000)
    meals: list[PlanMeal] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def valid_period_and_meals(self):
        if self.end_on < self.start_on:
            raise ValueError("A validade deve terminar após o início do plano.")
        ids = [meal.id for meal in self.meals]
        if len(ids) != len(set(ids)):
            raise ValueError("Identificadores de refeições devem ser distintos.")
        return self


class PlanUpdate(PlanContent):
    expected_revision: int = Field(ge=1)


class PlanRevision(BaseModel):
    expected_revision: int = Field(ge=1)


class MealPlanResponse(PlanContent):
    id: UUID
    patient_id: UUID
    author_id: UUID
    author_name: str
    status: str
    revision: int
    effective_end_on: date | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    closed_at: datetime | None


class MealPlanPage(BaseModel):
    items: list[MealPlanResponse]
    total: int
    offset: int
    limit: int
