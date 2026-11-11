from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.care.outbox import cipher
from app.config.settings import Settings
from app.uazapi.client import UazapiError, configure_instance_webhook, provision_instance
from app.uazapi.models import UazapiConnection


async def ensure_connection(
    db: AsyncSession, user_id: UUID, settings: Settings
) -> UazapiConnection:
    query = select(UazapiConnection).where(UazapiConnection.user_id == user_id)
    row = await db.scalar(query)
    if row and row.base_url and row.encrypted_token:
        return row
    if not (
        settings.uazapi_base_url and settings.uazapi_admin_token and settings.outbox_encryption_key
    ):
        raise UazapiError("not_configured")

    base_url = str(settings.uazapi_base_url).rstrip("/")
    name = f"mais-saude-{user_id}"
    reservation = f"pending:{name}"
    created = await db.scalar(
        insert(UazapiConnection)
        .values(user_id=user_id, instance_id=reservation, base_url=base_url)
        .on_conflict_do_nothing(index_elements=[UazapiConnection.user_id])
        .returning(UazapiConnection.id)
    )
    # Persist the reservation before any provider call can create a remote instance.
    await db.commit()
    row = await db.scalar(query.with_for_update().execution_options(populate_existing=True))
    if not row:
        raise UazapiError("provision_pending")
    if row.base_url and row.encrypted_token:
        return row
    if row.instance_id != reservation or row.base_url != base_url:
        raise UazapiError("not_configured")

    create = created == row.id
    try:
        if not create:
            try:
                instance_id, token = await run_in_threadpool(
                    provision_instance, settings, name, create=False
                )
            except UazapiError as error:
                if error.code != "provision_missing":
                    raise
                now = datetime.now(UTC)
                # Allow a timed-out create to become visible before issuing another one.
                if now - row.updated_at < timedelta(minutes=5):
                    raise UazapiError("provision_pending") from None
                row.updated_at = now
                await db.commit()
                row = await db.scalar(
                    query.with_for_update().execution_options(populate_existing=True)
                )
                if row and row.base_url and row.encrypted_token:
                    return row
                if not row or row.instance_id != reservation or row.updated_at != now:
                    raise UazapiError("provision_pending") from None
                create = True
        if create:
            instance_id, token = await run_in_threadpool(
                provision_instance, settings, name, create=True
            )
    except UazapiError as error:
        if error.code == "provision_rejected":
            await db.delete(row)
            await db.commit()
        raise

    if settings.uazapi_webhook_base_url:
        webhook_base = str(settings.uazapi_webhook_base_url).rstrip("/")
        webhook = f"{webhook_base}/api/v1/whatsapp/uazapi/webhook/{row.id}"
        instance = settings.model_copy(update={"uazapi_instance_token": token})
        await run_in_threadpool(configure_instance_webhook, instance, webhook)
    row.instance_id = instance_id
    row.encrypted_token = cipher().encrypt(token.get_secret_value().encode()).decode()
    await db.commit()
    return row
