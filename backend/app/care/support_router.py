from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.account_models import SupportMessageModel
from app.care.interaction_schemas import MessageCreate, MessageRead
from app.care.policies import audit, lock_users, utcnow
from app.database.session import get_db
from app.users.domain.enums import UserRole, UserStatus
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/support", tags=["Suporte"])
Actor = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db, scope="function")]


class SupportContact(BaseModel):
    id: UUID
    name: str
    active: bool
    unread: int


class ContactPage(BaseModel):
    items: list[SupportContact]
    total: int
    offset: int
    limit: int


class SupportMessage(BaseModel):
    id: UUID
    sender_id: UUID
    text: str
    sent_at: datetime
    read_at: datetime | None


class SupportMessagePage(BaseModel):
    items: list[SupportMessage]
    next_cursor: UUID | None


def counterpart_role(actor):
    if actor.role not in (UserRole.ADMIN, UserRole.NUTRITIONIST):
        raise HTTPException(403, "Acesso não autorizado.")
    return UserRole.NUTRITIONIST if actor.role == UserRole.ADMIN else UserRole.ADMIN


async def pair(db, actor, other_id):
    role = counterpart_role(actor)
    other = await db.get(UserModel, other_id)
    if not other or other.role != role or other.deactivated_at:
        raise HTTPException(404, "Contato não encontrado.")
    return (actor.id, other.id) if actor.role == UserRole.ADMIN else (other.id, actor.id)


def in_pair(admin_id, nutritionist_id):
    return (
        SupportMessageModel.admin_id == admin_id,
        SupportMessageModel.nutritionist_id == nutritionist_id,
    )


def message(row):
    return {key: getattr(row, key) for key in ("id", "sender_id", "text", "sent_at", "read_at")}


@router.get("/contacts", response_model=ContactPage)
async def contacts(
    actor: Actor,
    db: DB,
    search: str = Query("", max_length=120),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    role = counterpart_role(actor)
    query = select(UserModel).where(UserModel.role == role, UserModel.deactivated_at.is_(None))
    if search.strip():
        query = query.where(UserModel.name.ilike(f"%{search.strip()}%"))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(query.order_by(UserModel.name, UserModel.id).offset(offset).limit(limit))
    ).all()
    items = []
    for row in rows:
        admin, nutri = (actor.id, row.id) if actor.role == UserRole.ADMIN else (row.id, actor.id)
        unread = await db.scalar(
            select(func.count())
            .select_from(SupportMessageModel)
            .where(
                *in_pair(admin, nutri),
                SupportMessageModel.sender_id != actor.id,
                SupportMessageModel.read_at.is_(None),
            )
        )
        items.append(
            {
                "id": row.id,
                "name": row.name,
                "active": row.status == UserStatus.ACTIVE,
                "unread": unread,
            }
        )
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/{other_id}/messages", response_model=SupportMessagePage)
async def messages(
    other_id: UUID,
    actor: Actor,
    db: DB,
    before: UUID | None = None,
    limit: int = Query(30, ge=1, le=100),
):
    ids = await pair(db, actor, other_id)
    query = select(SupportMessageModel).where(*in_pair(*ids))
    if before:
        cursor = await db.scalar(query.where(SupportMessageModel.id == before))
        if not cursor:
            raise HTTPException(404, "Mensagem não encontrada.")
        query = query.where(
            (SupportMessageModel.sent_at < cursor.sent_at)
            | (
                (SupportMessageModel.sent_at == cursor.sent_at)
                & (SupportMessageModel.id < cursor.id)
            )
        )
    rows = (
        await db.scalars(
            query.order_by(SupportMessageModel.sent_at.desc(), SupportMessageModel.id.desc()).limit(
                limit + 1
            )
        )
    ).all()
    return {
        "items": [message(row) for row in rows[:limit]],
        "next_cursor": rows[limit - 1].id if len(rows) > limit else None,
    }


@router.post("/{other_id}/messages", status_code=201, response_model=SupportMessage)
async def send(other_id: UUID, data: MessageCreate, actor: Actor, db: DB):
    users = await lock_users(db, other_id)
    actor.role = users[actor.id].role
    ids = await pair(db, actor, other_id)
    if users[other_id].status != UserStatus.ACTIVE:
        raise HTTPException(409, "O contato está bloqueado.")
    existing = await db.get(SupportMessageModel, data.id)
    if existing:
        if (existing.admin_id, existing.nutritionist_id, existing.sender_id, existing.text) != (
            *ids,
            actor.id,
            data.text,
        ):
            raise HTTPException(409, "Identificador de mensagem já utilizado.")
        return message(existing)
    row = SupportMessageModel(
        id=data.id, admin_id=ids[0], nutritionist_id=ids[1], sender_id=actor.id, text=data.text
    )
    db.add(row)
    await db.flush()
    audit(db, "send_support_message", "support_message", row.id)
    return message(row)


@router.post("/{other_id}/read", status_code=204)
async def read(other_id: UUID, data: MessageRead, actor: Actor, db: DB):
    ids = await pair(db, actor, other_id)
    await db.execute(
        update(SupportMessageModel)
        .where(
            *in_pair(*ids),
            SupportMessageModel.id.in_(data.ids),
            SupportMessageModel.sender_id != actor.id,
            SupportMessageModel.read_at.is_(None),
        )
        .values(read_at=utcnow())
    )
