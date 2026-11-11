"""Register the configured test connection: uv run python -m app.whatsapp.setup.

Does not call Meta, connect a real number, seed users or create assignments.
"""

import asyncio

from sqlalchemy import select

from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel
from app.whatsapp.models import WhatsAppConnection


async def setup():
    settings = get_settings()
    if not settings.whatsapp_enabled:
        raise SystemExit("Configure e habilite WHATSAPP_ENABLED no ambiente isolado do piloto.")
    async with AsyncSessionLocal() as db, db.begin():
        user = await db.get(UserModel, settings.whatsapp_pilot_nutritionist_id)
        if (
            not user
            or user.role != UserRole.NUTRITIONIST
            or user.status != UserStatus.ACTIVE
            or user.deactivated_at
        ):
            raise SystemExit("O participante deve ser um nutricionista ativo neste banco.")
        row = await db.scalar(
            select(WhatsAppConnection).where(WhatsAppConnection.nutritionist_id == user.id)
        )
        if row and row.phone_number_id != settings.whatsapp_phone_number_id:
            raise SystemExit("Conexão já existente com outro número. Não foi modificada.")
        if not row:
            db.add(
                WhatsAppConnection(
                    nutritionist_id=user.id, phone_number_id=settings.whatsapp_phone_number_id
                )
            )
    print("Conexão local registrada. Ainda é necessário configurar e validar o webhook na Meta.")


if __name__ == "__main__":
    asyncio.run(setup())
