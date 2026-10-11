from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.models import CareAssignmentModel, EmailOutboxModel, InvitationModel
from app.care.plan_models import MealPlanModel
from app.care.plan_router import local_today
from app.care.policies import require_admin, utcnow
from app.database.session import get_db
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserAccessDeniedError
from app.users.domain.user import User
from app.users.infrastructure.models import AuditEventModel, UserModel
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])


class MonthlyRegistration(BaseModel):
    month: str
    total: int


class RecentAccess(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole
    last_access_at: datetime


class AdminDashboard(BaseModel):
    as_of: datetime
    total: int
    active: int
    blocked: int
    deactivated: int
    recent_registrations: int
    roles: dict[UserRole, int]
    months: list[MonthlyRegistration]
    recent_accesses: list[RecentAccess]
    failed_invitation_deliveries: int
    delayed_invitation_deliveries: int


class PatientWithoutPlan(BaseModel):
    id: UUID
    name: str


class NutritionistPlanSummary(BaseModel):
    as_of: datetime
    active_plans: int
    patients_without_plan: int
    pending_patients: list[PatientWithoutPlan]


def month_start(reference: datetime, shift: int) -> datetime:
    index = reference.year * 12 + reference.month - 1 + shift
    return reference.replace(
        year=index // 12, month=index % 12 + 1, day=1, hour=0, minute=0, second=0, microsecond=0
    )


@router.get("/admin", response_model=AdminDashboard)
async def admin_dashboard(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    require_admin(actor)
    now = utcnow()
    totals = (
        await db.execute(
            select(
                UserModel.role,
                UserModel.status,
                UserModel.deactivated_at.is_not(None).label("deactivated"),
                func.count().label("total"),
            ).group_by(UserModel.role, UserModel.status, UserModel.deactivated_at.is_not(None))
        )
    ).all()
    monthly_starts = [month_start(now, shift) for shift in range(-5, 1)]
    monthly_counts = (
        await db.execute(
            select(
                *[
                    func.count().filter(
                        UserModel.created_at >= start,
                        UserModel.created_at < month_start(start, 1),
                    )
                    for start in monthly_starts
                ]
            ).where(UserModel.deactivated_at.is_(None))
        )
    ).one()
    months = [
        MonthlyRegistration(month=start.strftime("%Y-%m"), total=monthly_counts[index])
        for index, start in enumerate(monthly_starts)
    ]
    recent_registrations = await db.scalar(
        select(func.count())
        .select_from(UserModel)
        .where(UserModel.deactivated_at.is_(None), UserModel.created_at >= now - timedelta(days=30))
    )
    last_login = (
        select(
            AuditEventModel.actor_user_id.label("user_id"),
            func.max(AuditEventModel.created_at).label("last_access_at"),
        )
        .where(AuditEventModel.action == "login")
        .group_by(AuditEventModel.actor_user_id)
        .subquery()
    )
    recent = (
        await db.execute(
            select(
                UserModel.id,
                UserModel.name,
                UserModel.email,
                UserModel.role,
                last_login.c.last_access_at,
            )
            .join(last_login, last_login.c.user_id == UserModel.id)
            .where(UserModel.deactivated_at.is_(None))
            .order_by(last_login.c.last_access_at.desc(), UserModel.id.desc())
            .limit(5)
        )
    ).all()
    latest_invitation = (
        select(InvitationModel.id)
        .where(InvitationModel.user_id == UserModel.id)
        .order_by(InvitationModel.id.desc())
        .limit(1)
        .correlate(UserModel)
        .scalar_subquery()
    )
    pending_delivery = (
        select(EmailOutboxModel)
        .join(InvitationModel, InvitationModel.id == EmailOutboxModel.invitation_id)
        .join(UserModel, UserModel.id == InvitationModel.user_id)
        .where(
            InvitationModel.id == latest_invitation,
            InvitationModel.used_at.is_(None),
            InvitationModel.expires_at > now,
            UserModel.role == UserRole.NUTRITIONIST,
            UserModel.status == UserStatus.BLOCKED,
            UserModel.deactivated_at.is_(None),
            UserModel.credentials_changed_at.is_(None),
        )
    )
    failed = await db.scalar(
        select(func.count()).select_from(
            pending_delivery.where(EmailOutboxModel.failed_at.is_not(None)).subquery()
        )
    )
    delayed = await db.scalar(
        select(func.count()).select_from(
            pending_delivery.where(
                EmailOutboxModel.payload.is_not(None),
                EmailOutboxModel.failed_at.is_(None),
                EmailOutboxModel.delivered_at.is_(None),
                EmailOutboxModel.available_at < now - timedelta(minutes=10),
            ).subquery()
        )
    )
    return AdminDashboard(
        as_of=now,
        total=sum(row.total for row in totals if not row.deactivated),
        active=sum(
            row.total for row in totals if not row.deactivated and row.status == UserStatus.ACTIVE
        ),
        blocked=sum(
            row.total for row in totals if not row.deactivated and row.status == UserStatus.BLOCKED
        ),
        deactivated=sum(row.total for row in totals if row.deactivated),
        recent_registrations=recent_registrations or 0,
        roles={
            role: sum(row.total for row in totals if not row.deactivated and row.role == role)
            for role in UserRole
        },
        months=months,
        recent_accesses=[
            RecentAccess(
                id=row.id,
                name=row.name,
                email=row.email,
                role=row.role,
                last_access_at=row.last_access_at,
            )
            for row in recent
        ],
        failed_invitation_deliveries=failed or 0,
        delayed_invitation_deliveries=delayed or 0,
    )


@router.get("/nutritionist/plans", response_model=NutritionistPlanSummary)
async def nutritionist_plan_summary(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role != UserRole.NUTRITIONIST:
        raise UserAccessDeniedError("Acesso não autorizado.")
    today = local_today()
    active_plan = (
        select(MealPlanModel.patient_id)
        .where(
            MealPlanModel.patient_id == UserModel.id,
            MealPlanModel.status == "published",
            MealPlanModel.start_on <= today,
            MealPlanModel.effective_end_on >= today,
        )
        .exists()
    )
    linked = (
        select(UserModel.id, UserModel.name, active_plan.label("has_plan"))
        .join(
            CareAssignmentModel,
            (CareAssignmentModel.patient_id == UserModel.id)
            & CareAssignmentModel.ended_at.is_(None),
        )
        .where(
            CareAssignmentModel.nutritionist_id == actor.id,
            UserModel.role == UserRole.PATIENT,
            UserModel.deactivated_at.is_(None),
        )
        .order_by(UserModel.name, UserModel.id)
    )
    rows = (await db.execute(linked)).all()
    pending = [PatientWithoutPlan(id=row.id, name=row.name) for row in rows if not row.has_plan]
    return NutritionistPlanSummary(
        as_of=utcnow(),
        active_plans=len(rows) - len(pending),
        patients_without_plan=len(pending),
        pending_patients=pending[:10],
    )
