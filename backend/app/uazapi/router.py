from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.config.settings import Settings, get_settings
from app.uazapi.client import ConnectionStatus, UazapiError, connection_status
from app.users.domain.enums import UserRole
from app.users.domain.user import User
from app.users.presentation.dependencies import get_current_user

router = APIRouter(prefix="/whatsapp/uazapi", tags=["WhatsApp UazAPI"])


@router.get("/connection", response_model=ConnectionStatus)
def connection(
    actor: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ConnectionStatus:
    if actor.role != UserRole.NUTRITIONIST or actor.id != settings.uazapi_nutritionist_id:
        raise HTTPException(403, "Conexão indisponível para esta conta.")
    try:
        return connection_status(settings)
    except UazapiError as error:
        status = 503 if error.code == "not_configured" else 504 if error.code == "timeout" else 502
        messages = {
            "not_configured": "A conexão com o WhatsApp ainda não foi configurada.",
            "timeout": "A consulta ao WhatsApp demorou demais. Tente novamente.",
            "invalid_credentials": "Não foi possível autenticar a conexão com o WhatsApp.",
            "unavailable": "Não foi possível conectar ao serviço do WhatsApp. Tente novamente.",
            "invalid_response": "O serviço do WhatsApp retornou uma resposta inválida.",
        }
        detail = messages.get(error.code, "Não foi possível consultar a conexão com o WhatsApp.")
        raise HTTPException(status, detail=detail) from None
