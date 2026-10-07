from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.models import CareAssignmentModel, CareLinkInvitationModel
from app.operations import actor_id
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
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
