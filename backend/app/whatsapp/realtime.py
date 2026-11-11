"""Socket transports invalidation hints only. HTTP endpoints remain the data boundary."""

import asyncio
import hashlib
import json
import logging
import secrets
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from starlette.websockets import WebSocketState

from app.care.policies import utcnow
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.security.jwt import JWTService
from app.security.rate_limit import limit_sensitive_requests
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import RefreshSessionModel, UserModel
from app.users.presentation.dependencies import bearer_scheme, get_jwt_service
from app.whatsapp.models import WhatsAppSocketTicket
from app.whatsapp.router import Db, Pilot

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp piloto"])
logger = logging.getLogger("nutri.whatsapp.realtime")
CHECK_INTERVAL = 5


@router.post("/realtime-ticket", dependencies=[Depends(limit_sensitive_requests)])
async def issue_ticket(
    actor: Pilot,
    db: Db,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    jwt_service: Annotated[JWTService, Depends(get_jwt_service)],
):
    claims = jwt_service.decode_access_token(credentials.credentials)
    raw = secrets.token_urlsafe(32)
    access_expires = datetime.fromtimestamp(claims["exp"], UTC)
    expires = min(utcnow() + timedelta(seconds=30), access_expires)
    await db.execute(
        delete(WhatsAppSocketTicket).where(WhatsAppSocketTicket.expires_at <= utcnow())
    )
    db.add(
        WhatsAppSocketTicket(
            ticket_hash=hashlib.sha256(raw.encode()).hexdigest(),
            user_id=actor.id,
            session_family=claims["sid"],
            issued_at=datetime.fromtimestamp(claims["iat"], UTC),
            access_expires_at=access_expires,
            expires_at=expires,
        )
    )
    return {"ticket": raw}


async def consume_ticket(raw: str) -> WhatsAppSocketTicket | None:
    if len(raw) != 43:
        return None
    async with AsyncSessionLocal() as db, db.begin():
        # DELETE RETURNING makes consumption atomic across API processes.
        return (
            await db.execute(
                delete(WhatsAppSocketTicket)
                .where(
                    WhatsAppSocketTicket.ticket_hash == hashlib.sha256(raw.encode()).hexdigest(),
                    WhatsAppSocketTicket.expires_at > utcnow(),
                )
                .returning(WhatsAppSocketTicket)
            )
        ).scalar_one_or_none()


async def authorized(ticket: WhatsAppSocketTicket) -> bool:
    settings = get_settings()
    if (
        not settings.whatsapp_enabled
        or ticket.user_id != settings.whatsapp_pilot_nutritionist_id
        or ticket.access_expires_at <= utcnow()
    ):
        return False
    async with AsyncSessionLocal() as db:
        user = await db.get(UserModel, ticket.user_id)
        if (
            not user
            or user.role != UserRole.NUTRITIONIST
            or user.status != UserStatus.ACTIVE
            or user.deactivated_at
            or (user.credentials_changed_at and ticket.issued_at < user.credentials_changed_at)
        ):
            return False
        return bool(
            await db.scalar(
                select(RefreshSessionModel.id)
                .where(
                    RefreshSessionModel.user_id == ticket.user_id,
                    RefreshSessionModel.family_id == ticket.session_family,
                    RefreshSessionModel.revoked_at.is_(None),
                    RefreshSessionModel.expires_at > utcnow(),
                )
                .limit(1)
            )
        )


async def receive_changes(socket: WebSocket, connection, ticket: WhatsAppSocketTicket):
    async for notification in connection.notifies():
        try:
            data = json.loads(notification.payload)
        except ValueError:
            continue
        if not isinstance(data, dict) or data.get("nutritionist_id") != str(ticket.user_id):
            continue
        if not await authorized(ticket):
            await socket.close(code=1008)
            return
        await socket.send_json(
            {"type": "whatsapp.conversation_changed", "contact_id": data.get("contact_id")}
        )


async def guard_session(socket: WebSocket, ticket: WhatsAppSocketTicket):
    ticks = 0
    while True:
        await asyncio.sleep(CHECK_INTERVAL)
        if not await authorized(ticket):
            await socket.close(code=1008)
            return
        ticks += 1
        if ticks % 4 == 0:
            await socket.send_json({"type": "heartbeat"})


async def wait_disconnect(socket: WebSocket):
    while True:
        event = await socket.receive()
        if event["type"] == "websocket.disconnect":
            return
        # This is a notification channel: commands and chat messages use HTTP.
        await socket.close(code=1008)
        return


@router.websocket("/realtime")
async def realtime(socket: WebSocket):
    settings = get_settings()
    if not settings.whatsapp_enabled or socket.headers.get("origin") not in settings.cors_origins:
        await socket.close(code=1008)
        return
    await socket.accept()
    tasks = []
    try:
        async with asyncio.timeout(5):
            # First frame carries the one-use ticket, keeping credentials out of URL/access logs.
            frame = await socket.receive()
        if frame["type"] == "websocket.disconnect":
            return
        raw = frame.get("text")
        ticket = await consume_ticket(raw) if isinstance(raw, str) else None
        if not ticket or not await authorized(ticket):
            await socket.close(code=1008)
            return
        conninfo = (
            make_url(settings.database_url)
            .set(drivername="postgresql")
            .render_as_string(hide_password=False)
        )
        # One dedicated LISTEN connection per socket is bounded by the small pilot audience.
        # Do not route this connection through a transaction-pooling proxy.
        async with await psycopg.AsyncConnection.connect(
            conninfo, autocommit=True, connect_timeout=5
        ) as connection:
            await connection.execute("LISTEN nutri_whatsapp_changes")
            await socket.send_json({"type": "ready"})
            tasks = [
                asyncio.create_task(receive_changes(socket, connection, ticket)),
                asyncio.create_task(guard_session(socket, ticket)),
                asyncio.create_task(wait_disconnect(socket)),
            ]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                # Stop the notifies generator before its connection context closes.
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    except WebSocketDisconnect:
        pass
    except TimeoutError:
        with suppress(RuntimeError):
            await socket.close(code=1008)
    except (psycopg.Error, SQLAlchemyError, RuntimeError, ValueError) as error:
        logger.warning("whatsapp_socket_closed exception_type=%s", type(error).__name__)
        if socket.application_state == WebSocketState.CONNECTED:
            with suppress(RuntimeError):
                await socket.close(code=1011)
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
