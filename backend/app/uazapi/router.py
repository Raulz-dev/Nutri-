from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.config.settings import Settings, get_settings
from app.uazapi.client import (
    ConnectionStatus,
    PairingStatus,
    UazapiError,
    connect_instance,
    connection_status,
    pairing_status,
)
from app.users.domain.enums import UserRole
from app.users.domain.user import User
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/whatsapp/uazapi", tags=["WhatsApp UazAPI"])


def authorized_settings(
    actor: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Settings:
    if actor.role != UserRole.NUTRITIONIST or actor.id != settings.uazapi_nutritionist_id:
        raise HTTPException(403, "Conexão indisponível para esta conta.")
    return settings


def provider_error(error: UazapiError) -> HTTPException:
    status = 503 if error.code == "not_configured" else 504 if error.code == "timeout" else 502
    messages = {
        "not_configured": "A conexão com o WhatsApp ainda não foi configurada.",
        "timeout": "A consulta ao WhatsApp demorou demais. Tente novamente.",
        "invalid_credentials": "Não foi possível autenticar a conexão com o WhatsApp.",
        "unavailable": "Não foi possível conectar ao serviço do WhatsApp. Tente novamente.",
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
def pairing(settings: Authorized) -> PairingStatus:
    try:
        return pairing_status(settings)
    except UazapiError as error:
        raise provider_error(error) from None


@router.post("/connect", response_model=PairingStatus)
def connect(settings: Authorized) -> PairingStatus:
    try:
        return connect_instance(settings)
    except UazapiError as error:
        raise provider_error(error) from None
