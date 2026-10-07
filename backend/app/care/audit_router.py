from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.care.policies import require_admin
from app.database.session import get_db
from app.users.domain.user import User
from app.users.infrastructure.models import AuditEventModel, UserModel
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/admin/audit-events", tags=["Audit"])


class AuditItem(BaseModel):
    id: UUID
    action: str
    entity_type: str
    entity_id: UUID | None
    target_name: str | None
    actor_name: str | None
    event_data: dict[str, Any]
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditItem]
    total: int
    offset: int
    limit: int


@router.get("", response_model=AuditPage)
async def list_audit(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    action: Annotated[str | None, Query(max_length=100)] = None,
):
    require_admin(actor)
    query = select(AuditEventModel)
    if action:
        query = query.where(AuditEventModel.action == action)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    owner = aliased(UserModel)
    target = aliased(UserModel)
    statement = (
        select(AuditEventModel, owner.name, target.name)
        .outerjoin(owner, owner.id == AuditEventModel.actor_user_id)
        .outerjoin(target, target.id == AuditEventModel.entity_id)
        .order_by(AuditEventModel.created_at.desc(), AuditEventModel.id.desc())
        .offset(offset)
        .limit(limit)
    )
    if action:
        statement = statement.where(AuditEventModel.action == action)
    rows = (await db.execute(statement)).all()
    return AuditPage(
        items=[
            AuditItem(
                id=event.id,
                action=event.action,
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                target_name=target_name,
                actor_name=actor_name,
                event_data=event.event_data,
                created_at=event.created_at,
            )
            for event, actor_name, target_name in rows
        ],
        total=total or 0,
        offset=offset,
        limit=limit,
    )
