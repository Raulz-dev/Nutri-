from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.interaction_models import AppointmentModel
from app.care.models import CareAssignmentModel, CareLinkInvitationModel
from app.care.plan_models import MealPlanModel
from app.operations import actor_id
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
from app.users.domain.user import User
from app.users.infrastructure.models import AuditEventModel, UserModel


def audit(
    db: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: UUID,
    actor_override: UUID | None = None,
    **data,
):
    db.add(
        AuditEventModel(
            actor_user_id=actor_override or actor_id.get(),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            event_data=data,
        )
    )


async def lock_users(db: AsyncSession, *ids: UUID) -> dict[UUID, UserModel]:
    actor = actor_id.get()
    rows = (
        await db.scalars(
            select(UserModel)
            .where(UserModel.id.in_(set(ids) | ({actor} if actor else set())))
            .order_by(UserModel.id)
            .execution_options(populate_existing=True)
            .with_for_update()
        )
    ).all()
    users = {row.id: row for row in rows}
    if actor and (
        actor not in users
        or users[actor].deactivated_at
        or users[actor].status != UserStatus.ACTIVE
    ):
        raise UserAccessDeniedError("Acesso não autorizado.")
    return users


async def require_no_assignments(db: AsyncSession, user_id: UUID):
    linked = await db.scalar(
        select(CareAssignmentModel.id)
        .where(
            or_(
                CareAssignmentModel.patient_id == user_id,
                CareAssignmentModel.nutritionist_id == user_id,
            ),
            CareAssignmentModel.ended_at.is_(None),
        )
        .limit(1)
    )
    if linked:
        raise UserConflictError(
            "Resolva os vínculos ativos antes de desativar ou alterar o perfil."
        )


async def cancel_pending_link_invitations(db: AsyncSession, user_id: UUID):
    await db.execute(
        update(CareLinkInvitationModel)
        .where(
            or_(
                CareLinkInvitationModel.patient_id == user_id,
                CareLinkInvitationModel.nutritionist_id == user_id,
            ),
            CareLinkInvitationModel.accepted_at.is_(None),
            CareLinkInvitationModel.declined_at.is_(None),
            CareLinkInvitationModel.canceled_at.is_(None),
        )
        .values(canceled_at=utcnow())
    )


def require_admin(user):
    if user.role != UserRole.ADMIN:
        raise UserAccessDeniedError("Apenas administradores podem realizar esta operação.")


def utcnow():
    return datetime.now(UTC)


async def current_assignment(db: AsyncSession, patient_id: UUID, lock=False):
    query = select(CareAssignmentModel).where(
        CareAssignmentModel.patient_id == patient_id, CareAssignmentModel.ended_at.is_(None)
    )
    if lock:
        query = query.with_for_update()
    return await db.scalar(query)


async def require_no_current_or_upcoming_plan(db: AsyncSession, patient_id: UUID):
    today = datetime.now(ZoneInfo("America/Fortaleza")).date()
    plan = await db.scalar(
        select(MealPlanModel.id)
        .where(
            MealPlanModel.patient_id == patient_id,
            MealPlanModel.status == "published",
            MealPlanModel.effective_end_on >= today,
        )
        .limit(1)
    )
    if plan:
        raise UserConflictError(
            "Encerre o plano alimentar vigente ou futuro antes de alterar o vínculo."
        )


async def require_no_upcoming_appointments(db: AsyncSession, patient_id: UUID):
    now = datetime.now(ZoneInfo("America/Fortaleza"))
    appointment = await db.scalar(
        select(AppointmentModel.id)
        .where(
            AppointmentModel.patient_id == patient_id,
            AppointmentModel.status == "scheduled",
            or_(
                AppointmentModel.appointment_on > now.date(),
                (AppointmentModel.appointment_on == now.date())
                & (AppointmentModel.appointment_at >= now.time().replace(tzinfo=None)),
            ),
        )
        .limit(1)
    )
    if appointment:
        raise UserConflictError("Cancele as consultas futuras antes de alterar o vínculo.")


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
