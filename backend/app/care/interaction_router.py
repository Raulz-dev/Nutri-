from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.care.interaction_models import AppointmentModel, CareMessageModel
from app.care.interaction_schemas import (
    AppointmentContent,
    AppointmentCreate,
    AppointmentPage,
    AppointmentResponse,
    AppointmentStatus,
    AppointmentUpdate,
    ConversationPage,
    ConversationResponse,
    MessageCreate,
    MessageCursor,
    MessagePage,
    MessageRead,
    MessageResponse,
)
from app.care.models import CareAssignmentModel
from app.care.policies import audit, clinical_writer, lock_users, utcnow
from app.database.session import get_db
from app.users.domain.enums import UserRole
from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError
from app.users.domain.user import User
from app.users.infrastructure.models import UserModel
from app.users.presentation.dependencies import get_current_user

router = APIRouter(tags=["Consultas e mensagens"])


def appointment_response(row: AppointmentModel, patient_name: str) -> AppointmentResponse:
    return AppointmentResponse.model_validate(
        {
            **{
                key: getattr(row, key)
                for key in AppointmentResponse.model_fields
                if key != "patient_name"
            },
            "patient_name": patient_name,
        }
    )


def set_appointment_content(row: AppointmentModel, data: AppointmentContent):
    row.appointment_on = data.appointment_on
    row.appointment_at = data.appointment_at
    row.format = data.format
    row.location = data.location
    row.guidance = data.guidance.strip()


async def flush_appointment(db: AsyncSession):
    try:
        await db.flush()
    except IntegrityError as error:
        raise UserConflictError("Já existe uma consulta marcada neste horário.") from error


@router.get("/appointments", response_model=AppointmentPage)
async def list_appointments(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    patient_id: UUID | None = None,
    appointment_on: date | None = None,
    status: Literal["scheduled", "completed", "cancelled"] | None = None,
    upcoming: bool = False,
):
    if actor.role not in (UserRole.PATIENT, UserRole.NUTRITIONIST):
        raise UserAccessDeniedError("Acesso não autorizado.")
    filtered = select(AppointmentModel, UserModel.name).join(
        UserModel, UserModel.id == AppointmentModel.patient_id
    )
    filtered = filtered.where(
        AppointmentModel.patient_id == actor.id
        if actor.role == UserRole.PATIENT
        else AppointmentModel.nutritionist_id == actor.id
    )
    if patient_id:
        if actor.role == UserRole.PATIENT and patient_id != actor.id:
            raise UserAccessDeniedError("Acesso não autorizado.")
        filtered = filtered.where(AppointmentModel.patient_id == patient_id)
    if appointment_on:
        filtered = filtered.where(AppointmentModel.appointment_on == appointment_on)
    if status:
        filtered = filtered.where(AppointmentModel.status == status)
    if upcoming:
        now = datetime.now(ZoneInfo("America/Fortaleza"))
        filtered = filtered.where(
            AppointmentModel.status == "scheduled",
            or_(
                AppointmentModel.appointment_on > now.date(),
                (AppointmentModel.appointment_on == now.date())
                & (AppointmentModel.appointment_at >= now.time().replace(tzinfo=None)),
            ),
        )
    total = await db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    ordering = (
        (AppointmentModel.appointment_on, AppointmentModel.appointment_at, AppointmentModel.id)
        if upcoming
        else (
            AppointmentModel.appointment_on.desc(),
            AppointmentModel.appointment_at.desc(),
            AppointmentModel.id.desc(),
        )
    )
    rows = (await db.execute(filtered.order_by(*ordering).offset(offset).limit(limit))).all()
    return AppointmentPage(
        items=[appointment_response(row, name) for row, name in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/appointments/next", response_model=AppointmentResponse | None)
async def next_appointment(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    if actor.role != UserRole.PATIENT:
        raise UserAccessDeniedError("Acesso não autorizado.")
    now = datetime.now(ZoneInfo("America/Fortaleza"))
    row = await db.scalar(
        select(AppointmentModel)
        .where(
            AppointmentModel.patient_id == actor.id,
            AppointmentModel.status == "scheduled",
            or_(
                AppointmentModel.appointment_on > now.date(),
                (AppointmentModel.appointment_on == now.date())
                & (AppointmentModel.appointment_at >= now.time().replace(tzinfo=None)),
            ),
        )
        .order_by(AppointmentModel.appointment_on, AppointmentModel.appointment_at)
        .limit(1)
    )
    if not row:
        return None
    patient = await db.get(UserModel, actor.id)
    return appointment_response(row, patient.name)


@router.post("/appointments", response_model=AppointmentResponse, status_code=201)
async def create_appointment(
    data: AppointmentCreate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_writer(db, actor, data.patient_id)
    patient = await db.get(UserModel, data.patient_id)
    existing = await db.get(AppointmentModel, data.id)
    if existing:
        if existing.nutritionist_id != actor.id or existing.patient_id != data.patient_id:
            raise UserConflictError("Identificador de consulta já utilizado.")
        if any(
            getattr(existing, key) != getattr(data, key)
            for key in ("appointment_on", "appointment_at", "format", "location", "guidance")
        ):
            raise UserConflictError("A consulta já existe com outros dados.")
        return appointment_response(existing, patient.name)
    if datetime.combine(
        data.appointment_on, data.appointment_at, ZoneInfo("America/Fortaleza")
    ) <= datetime.now(ZoneInfo("America/Fortaleza")):
        raise UserConflictError("Agende uma data e horário futuros.")
    row = AppointmentModel(
        id=data.id, patient_id=data.patient_id, nutritionist_id=actor.id, author_id=actor.id
    )
    set_appointment_content(row, data)
    db.add(row)
    await flush_appointment(db)
    audit(db, "create_appointment", "appointment", row.id, patient_id=str(data.patient_id))
    return appointment_response(row, patient.name)


@router.put("/appointments/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(
    appointment_id: UUID,
    data: AppointmentUpdate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await clinical_writer(db, actor, data.patient_id)
    row = await db.get(AppointmentModel, appointment_id)
    if not row or row.nutritionist_id != actor.id or row.patient_id != data.patient_id:
        raise HTTPException(404, "Consulta não encontrada.")
    if row.status != "scheduled" or row.revision != data.expected_revision:
        raise UserConflictError("A consulta foi alterada ou encerrada. Recarregue a página.")
    if datetime.combine(
        data.appointment_on, data.appointment_at, ZoneInfo("America/Fortaleza")
    ) <= datetime.now(ZoneInfo("America/Fortaleza")):
        raise UserConflictError("Agende uma data e horário futuros.")
    set_appointment_content(row, data)
    row.revision += 1
    await flush_appointment(db)
    await db.refresh(row)
    patient = await db.get(UserModel, row.patient_id)
    audit(db, "update_appointment", "appointment", row.id, revision=row.revision)
    return appointment_response(row, patient.name)


@router.post("/appointments/{appointment_id}/status", response_model=AppointmentResponse)
async def change_appointment_status(
    appointment_id: UUID,
    data: AppointmentStatus,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    row = await db.get(AppointmentModel, appointment_id)
    if not row or row.nutritionist_id != actor.id:
        raise HTTPException(404, "Consulta não encontrada.")
    await clinical_writer(db, actor, row.patient_id)
    row = await db.scalar(
        select(AppointmentModel)
        .where(AppointmentModel.id == appointment_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if row.status != "scheduled" or row.revision != data.expected_revision:
        raise UserConflictError("A consulta foi alterada ou encerrada. Recarregue a página.")
    row.status = data.status
    row.revision += 1
    await db.flush()
    await db.refresh(row)
    patient = await db.get(UserModel, row.patient_id)
    audit(db, "change_appointment_status", "appointment", row.id, status=data.status)
    return appointment_response(row, patient.name)


async def accessible_conversation(
    db: AsyncSession, actor: User, assignment_id: UUID
) -> CareAssignmentModel:
    row = await db.get(CareAssignmentModel, assignment_id)
    if not row or actor.id not in (row.patient_id, row.nutritionist_id):
        raise HTTPException(404, "Conversa não encontrada.")
    return row


@router.get("/conversations", response_model=ConversationPage)
async def list_conversations(
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    if actor.role not in (UserRole.PATIENT, UserRole.NUTRITIONIST):
        raise UserAccessDeniedError("Acesso não autorizado.")
    filtered = select(CareAssignmentModel).where(
        CareAssignmentModel.patient_id == actor.id
        if actor.role == UserRole.PATIENT
        else CareAssignmentModel.nutritionist_id == actor.id
    )
    total = await db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    rows = (
        await db.scalars(
            filtered.order_by(CareAssignmentModel.started_at.desc(), CareAssignmentModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    result = []
    for row in rows:
        patient = await db.get(UserModel, row.patient_id)
        nutritionist = await db.get(UserModel, row.nutritionist_id)
        unread = (
            await db.scalar(
                select(func.count())
                .select_from(CareMessageModel)
                .where(
                    CareMessageModel.assignment_id == row.id,
                    CareMessageModel.sender_id != actor.id,
                    CareMessageModel.read_at.is_(None),
                )
            )
            or 0
        )
        result.append(
            ConversationResponse(
                id=row.id,
                patient_id=row.patient_id,
                patient_name=patient.name,
                nutritionist_id=row.nutritionist_id,
                nutritionist_name=nutritionist.name,
                active=row.ended_at is None,
                started_at=row.started_at,
                ended_at=row.ended_at,
                unread=unread,
            )
        )
    return ConversationPage(items=result, total=total, offset=offset, limit=limit)


@router.get("/conversations/{assignment_id}/messages", response_model=MessagePage)
async def list_messages(
    assignment_id: UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
    before_sent_at: datetime | None = None,
    before_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=100),
):
    await accessible_conversation(db, actor, assignment_id)
    if (before_sent_at is None) != (before_id is None):
        raise HTTPException(422, "Informe o cursor completo.")
    filtered = select(CareMessageModel).where(CareMessageModel.assignment_id == assignment_id)
    total = await db.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    if before_sent_at is not None and before_id is not None:
        filtered = filtered.where(
            or_(
                CareMessageModel.sent_at < before_sent_at,
                (CareMessageModel.sent_at == before_sent_at) & (CareMessageModel.id < before_id),
            )
        )
    rows = (
        await db.scalars(
            filtered.order_by(CareMessageModel.sent_at.desc(), CareMessageModel.id.desc()).limit(
                limit + 1
            )
        )
    ).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return MessagePage(
        items=[MessageResponse.model_validate(row, from_attributes=True) for row in rows],
        total=total,
        limit=limit,
        next_cursor=MessageCursor(sent_at=rows[-1].sent_at, id=rows[-1].id) if has_more else None,
    )


@router.post(
    "/conversations/{assignment_id}/messages", response_model=MessageResponse, status_code=201
)
async def send_message(
    assignment_id: UUID,
    data: MessageCreate,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    conversation = await accessible_conversation(db, actor, assignment_id)
    users = await lock_users(db, conversation.patient_id)
    conversation = await db.scalar(
        select(CareAssignmentModel)
        .where(CareAssignmentModel.id == assignment_id)
        .execution_options(populate_existing=True)
    )
    existing = await db.get(CareMessageModel, data.id)
    if existing:
        if (
            existing.assignment_id != assignment_id
            or existing.sender_id != actor.id
            or existing.text != data.text
        ):
            raise UserConflictError("Identificador de mensagem já utilizado.")
        return MessageResponse.model_validate(existing, from_attributes=True)
    if conversation.ended_at or users[conversation.patient_id].deactivated_at:
        raise UserConflictError("Conversa encerrada. O histórico permanece disponível.")
    row = CareMessageModel(
        id=data.id, assignment_id=assignment_id, sender_id=actor.id, text=data.text
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as error:
        raise UserConflictError("Identificador de mensagem já utilizado.") from error
    audit(db, "send_care_message", "care_message", row.id, assignment_id=str(assignment_id))
    return MessageResponse.model_validate(row, from_attributes=True)


@router.post("/conversations/{assignment_id}/read", status_code=204)
async def mark_messages_read(
    assignment_id: UUID,
    data: MessageRead,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db, scope="function")],
):
    await accessible_conversation(db, actor, assignment_id)
    result = await db.execute(
        update(CareMessageModel)
        .where(
            CareMessageModel.assignment_id == assignment_id,
            CareMessageModel.id.in_(data.ids),
            CareMessageModel.sender_id != actor.id,
            CareMessageModel.read_at.is_(None),
        )
        .values(read_at=utcnow())
    )
    if result.rowcount:
        audit(db, "read_care_messages", "care_assignment", assignment_id, count=result.rowcount)
