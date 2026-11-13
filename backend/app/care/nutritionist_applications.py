from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints
from sqlalchemy import literal_column, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.account_models import ProfessionalProfileModel
from app.care.invites import invite_nutritionist
from app.care.models import NutritionistApplicationModel
from app.care.policies import audit, lock_users, require_admin, utcnow
from app.database.session import get_db
from app.users.domain.enums import UserRole
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.presentation.dependencies import get_current_user
from app.users.presentation.schemas import Cpf

router = APIRouter(tags=["Solicitações de nutricionistas"])
Actor = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db, scope="function")]
Application = NutritionistApplicationModel
ADMIN_PATH = "/admin/nutritionist-applications"


class ApplicationDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=2, max_length=120, pattern=r"^[^\x00]+$"
        ),
    ]
    email: EmailStr
    crn: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=2, max_length=80, pattern=r"^[^\x00]+$"
        ),
    ]


class ApplicationInput(ApplicationDetails):
    cpf: Cpf


class ApplicationItem(ApplicationDetails):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    cpf: str | None
    created_at: datetime


class ApplicationPage(BaseModel):
    items: list[ApplicationItem]
    has_more: bool


class ReviewInput(BaseModel):
    decision: Literal["approved", "rejected"]


@router.post("/nutritionist-applications", status_code=204)
async def submit_application(data: ApplicationInput, db: DB) -> None:
    name = User.validate_name(data.name)
    email = data.email.lower()
    if await db.scalar(select(UserModel.id).where(UserModel.email == email)):
        return
    await db.execute(
        insert(Application)
        .values(name=name, email=email, crn=data.crn, cpf=data.cpf)
        .on_conflict_do_nothing(
            index_elements=[Application.email],
            index_where=Application.decision.is_distinct_from(literal_column("'rejected'")),
        )
    )


@router.get(ADMIN_PATH, response_model=ApplicationPage)
async def pending_applications(
    actor: Actor,
    db: DB,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str, Query(max_length=320)] = "",
):
    require_admin(actor)
    page_size = 10
    statement = select(Application).where(Application.decision.is_(None))
    if term := search.strip():
        statement = statement.where(
            or_(
                Application.name.icontains(term, autoescape=True),
                Application.email.icontains(term, autoescape=True),
                Application.crn.icontains(term, autoescape=True),
            )
        )
    rows = (
        await db.scalars(
            statement.order_by(Application.created_at, Application.id)
            .offset(offset)
            .limit(page_size + 1)
        )
    ).all()
    return {"items": rows[:page_size], "has_more": len(rows) > page_size}


@router.post(ADMIN_PATH + "/{application_id}/review", status_code=204)
async def review_application(application_id: UUID, data: ReviewInput, actor: Actor, db: DB) -> None:
    require_admin(actor)
    users = await lock_users(db, actor.id)
    if users[actor.id].role != UserRole.ADMIN:
        raise HTTPException(403, "Acesso não autorizado.")
    application = await db.get(Application, application_id, with_for_update=True)
    if application is None:
        raise HTTPException(404, "Solicitação não encontrada.")
    if application.decision == data.decision:
        return
    if application.decision is not None:
        raise HTTPException(409, "Esta solicitação já foi analisada.")
    if data.decision == "approved":
        user = await invite_nutritionist(
            db, application.name, application.email, cpf=application.cpf
        )
        db.add(
            ProfessionalProfileModel(
                user_id=user.id, name=user.name, crn=application.crn, revision=1
            )
        )
    application.decision = data.decision
    application.reviewer_id = actor.id
    application.reviewed_at = utcnow()
    audit(
        db,
        "review_nutritionist_application",
        "nutritionist_application",
        application.id,
        decision=data.decision,
    )
