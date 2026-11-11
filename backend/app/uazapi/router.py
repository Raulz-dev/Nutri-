from typing import Annotated

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.care.outbox import cipher
from app.config.settings import Settings, get_settings
from app.database.session import get_db
from app.uazapi.client import (
    ConnectionStatus,
    PairingStatus,
    UazapiError,
    connect_instance,
    connection_status,
    pairing_status,
)
from app.uazapi.models import UazapiConnection
from app.uazapi.provisioning import ensure_connection
from app.users.domain.enums import UserRole
from app.users.domain.user import User
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/whatsapp/uazapi", tags=["WhatsApp UazAPI"])


Actor = Annotated[User, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db, scope="function")]
Config = Annotated[Settings, Depends(get_settings)]


async def owned_connection(
    actor: Actor,
    db: Db,
) -> UazapiConnection:
    if actor.role != UserRole.NUTRITIONIST:
        raise HTTPException(403, "Conexão indisponível para esta conta.")
    row = await db.scalar(select(UazapiConnection).where(UazapiConnection.user_id == actor.id))
    if not row or not row.base_url or not row.encrypted_token:
        raise provider_error(UazapiError("not_configured"))
    return row


OwnedConnection = Annotated[UazapiConnection, Depends(owned_connection)]


def authorized_settings(
    row: OwnedConnection, settings: Annotated[Settings, Depends(get_settings)]
) -> Settings:
    try:
        token = cipher().decrypt(row.encrypted_token.encode()).decode()
    except InvalidToken, RuntimeError, UnicodeError:
        raise provider_error(UazapiError("not_configured")) from None
    return settings.model_copy(
        update={"uazapi_base_url": row.base_url, "uazapi_instance_token": SecretStr(token)}
    )


def provider_error(error: UazapiError) -> HTTPException:
    status = 503 if error.code == "not_configured" else 504 if error.code == "timeout" else 502
    messages = {
        "not_configured": "A conexão com o WhatsApp ainda não foi configurada.",
        "timeout": "A consulta ao WhatsApp demorou demais. Tente novamente.",
        "invalid_credentials": "Não foi possível autenticar a conexão com o WhatsApp.",
        "unavailable": "Não foi possível conectar ao serviço do WhatsApp. Tente novamente.",
        "provision_pending": "Criação ainda não confirmada. Tente novamente para consultar.",
        "provision_rejected": "A UazAPI recusou a criação. Confira a configuração do servidor.",
        "invalid_response": "O serviço do WhatsApp retornou uma resposta inválida.",
    }
    detail = messages.get(error.code, "Não foi possível consultar a conexão com o WhatsApp.")
    return HTTPException(status, detail=detail)


Authorized = Annotated[Settings, Depends(authorized_settings)]


@router.get("/connection", response_model=ConnectionStatus)
def connection(settings: Authorized) -> ConnectionStatus:
    try:
        return connection_status(settings)
    except UazapiError as error:
        raise provider_error(error) from None


@router.get("/pairing", response_model=PairingStatus)
async def pairing(actor: Actor, db: Db, settings: Config) -> PairingStatus:
    try:
        row = await owned_connection(actor, db)
    except HTTPException as error:
        if error.status_code == 503 and settings.uazapi_admin_token and settings.uazapi_base_url:
            return PairingStatus(connected=False, logged_in=False, state="unlinked")
        raise
    try:
        return await run_in_threadpool(pairing_status, authorized_settings(row, settings))
    except UazapiError as error:
        raise provider_error(error) from None


@router.post("/connect", response_model=PairingStatus)
async def connect(actor: Actor, db: Db, settings: Config) -> PairingStatus:
    if actor.role != UserRole.NUTRITIONIST:
        raise HTTPException(403, "Conexão indisponível para esta conta.")
    try:
        row = await ensure_connection(db, actor.id, settings)
        return await run_in_threadpool(connect_instance, authorized_settings(row, settings))
    except UazapiError as error:
        raise provider_error(error) from None
