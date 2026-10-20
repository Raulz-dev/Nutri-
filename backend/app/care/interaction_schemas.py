from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AppointmentContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: UUID
    appointment_on: date
    appointment_at: time
    format: Literal["Presencial", "Online"]
    location: str = Field(min_length=1, max_length=500)
    guidance: str = Field(default="", max_length=2000)

    @field_validator("location", "guidance")
    @classmethod
    def normalized_text(cls, value: str, info):
        value = value.strip()
        if info.field_name == "location" and not value:
            raise ValueError("Informe o local ou link da consulta.")
        return value

    @model_validator(mode="after")
    def valid_link(self):
        if self.format == "Online" and not self.location.startswith(("https://", "http://")):
            raise ValueError("Informe um link começando com https:// ou http://.")
        return self


class AppointmentCreate(AppointmentContent):
    id: UUID


class AppointmentUpdate(AppointmentContent):
    expected_revision: int = Field(ge=1)


class AppointmentStatus(BaseModel):
    status: Literal["completed", "cancelled"]
    expected_revision: int = Field(ge=1)


class AppointmentResponse(AppointmentContent):
    id: UUID
    nutritionist_id: UUID
    author_id: UUID
    patient_name: str
    status: Literal["scheduled", "completed", "cancelled"]
    revision: int
    created_at: datetime
    updated_at: datetime


class AppointmentPage(BaseModel):
    items: list[AppointmentResponse]
    total: int
    offset: int
    limit: int


class ConversationResponse(BaseModel):
    id: UUID
    patient_id: UUID
    patient_name: str
    nutritionist_id: UUID
    nutritionist_name: str
    active: bool
    started_at: datetime
    ended_at: datetime | None
    unread: int


class ConversationPage(BaseModel):
    items: list[ConversationResponse]
    total: int
    offset: int
    limit: int


class MessageCreate(BaseModel):
    id: UUID
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def nonblank_text(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Escreva uma mensagem.")
        return value


class MessageResponse(BaseModel):
    # Preserve the public OpenAPI reference when disambiguating MessageResponse schemas.
    __module__ = "app.care.interaction_router"

    id: UUID
    assignment_id: UUID
    sender_id: UUID
    text: str
    sent_at: datetime
    read_at: datetime | None


class MessageCursor(BaseModel):
    sent_at: datetime
    id: UUID


class MessagePage(BaseModel):
    items: list[MessageResponse]
    total: int
    limit: int
    next_cursor: MessageCursor | None


class MessageRead(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=100)
