
import argparse
import asyncio
from getpass import getpass
from uuid import UUID

from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.care.outbox import cipher
from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.uazapi.client import UazapiError, instance_identity
from app.uazapi.models import UazapiConnection
from app.users.domain.enums import UserRole, UserStatus
from app.users.infrastructure.models import UserModel


async def link(user_id: UUID, token: SecretStr) -> None:
    settings = get_settings()
    if not settings.uazapi_base_url or not token:
        raise SystemExit("Configure UAZAPI_BASE_URL e informe o token da instância.")
    try:
        encrypted = cipher().encrypt(token.get_secret_value().encode()).decode()
    except RuntimeError:
        raise SystemExit("Configure OUTBOX_ENCRYPTION_KEY antes de vincular.") from None

    async with AsyncSessionLocal() as db:
        user = await db.get(UserModel, user_id)
        if (
            not user
            or user.role != UserRole.NUTRITIONIST
            or user.status != UserStatus.ACTIVE
            or user.deactivated_at
        ):
            raise SystemExit("Informe um nutricionista ativo.")
        try:
            instance_id = await asyncio.to_thread(
                instance_identity, settings.model_copy(update={"uazapi_instance_token": token})
            )
        except UazapiError:
            raise SystemExit("Não foi possível validar a instância na UazAPI.") from None
        row = await db.scalar(select(UazapiConnection).where(UazapiConnection.user_id == user_id))
        base_url = str(settings.uazapi_base_url).rstrip("/")
        if row and (row.instance_id != instance_id or row.base_url not in (None, base_url)):
            raise SystemExit("Este profissional já possui outra instância vinculada.")
        if row is None:
            row = UazapiConnection(user_id=user_id, instance_id=instance_id)
            db.add(row)
        row.base_url = base_url
        row.encrypted_token = encrypted
        try:
            await db.commit()
        except IntegrityError:
            raise SystemExit("Esta instância ou este profissional já tem vínculo.") from None
    print(f"Webhook: /api/v1/whatsapp/uazapi/webhook/{row.id}")
    print("Instância vinculada. Abra Mensagens → WhatsApp.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("user_id", type=UUID)
    parser.add_argument("--from-env", action="store_true", help="Importa o token do piloto atual.")
    args = parser.parse_args()
    token = (
        get_settings().uazapi_instance_token
        if args.from_env
        else SecretStr(getpass("Token da instância UazAPI: ").strip())
    )
    asyncio.run(link(args.user_id, token))


if __name__ == "__main__":
    main()
