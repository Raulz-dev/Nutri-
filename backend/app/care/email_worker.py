import asyncio
import json
import logging
from datetime import timedelta
from email.message import EmailMessage
from html import escape
from pathlib import Path
from string import Template
from urllib.parse import urlencode
from uuid import UUID

from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.care.invites import cipher
from app.care.models import EmailOutboxModel, InvitationModel
from app.care.policies import utcnow
from app.config.settings import Settings, get_settings
from app.database.session import AsyncSessionLocal
from app.users.infrastructure.email import SMTPPasswordResetSender

logger = logging.getLogger("nutri.outbox")
WELCOME_IMAGE = Path(__file__).with_name("assets") / "welcome.jpg"
WELCOME_TEMPLATE = Path(__file__).with_name("assets") / "invitation.html"


def invitation_message(
    recipient: str, token: str, invitation_id: UUID, settings: Settings
) -> EmailMessage:
    link = settings.invitation_url + "?" + urlencode({"token": token})
    message = EmailMessage()
    message["Subject"] = "Boas-vindas ao Nutri +: defina sua senha"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Message-ID"] = f"<{invitation_id}@nutri-invite>"
    message.set_content(
        "Boas-vindas ao Nutri +!\n\n"
        "Você foi convidado(a) para acompanhar seus pacientes na plataforma. "
        "Para começar, defina sua senha pelo link abaixo:\n\n"
        f"{link}\n\n"
        f"Este convite é pessoal, pode ser usado uma única vez e expira em "
        f"{settings.invitation_expiration_hours} horas.\n"
        "Se você não esperava este convite, ignore esta mensagem."
    )
    safe_link = escape(link, quote=True)
    html = Template(WELCOME_TEMPLATE.read_text(encoding="utf-8")).substitute(
        link=safe_link, hours=settings.invitation_expiration_hours
    )
    message.add_alternative(html, subtype="html")
    message.get_payload()[1].add_related(
        WELCOME_IMAGE.read_bytes(), maintype="image", subtype="jpeg", cid="<nutri-welcome>"
    )
    return message


async def deliver_one() -> bool:
    async with AsyncSessionLocal() as db, db.begin():
        row = await db.scalar(
            select(EmailOutboxModel)
            .where(
                EmailOutboxModel.payload.is_not(None),
                EmailOutboxModel.available_at <= utcnow(),
                EmailOutboxModel.delivered_at.is_(None),
                EmailOutboxModel.failed_at.is_(None),
            )
            .order_by(EmailOutboxModel.available_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not row:
            return False
        invitation = await db.get(InvitationModel, row.invitation_id)
        if not invitation or invitation.used_at or invitation.expires_at <= utcnow():
            row.payload = None
            row.failed_at = utcnow()
            return True
        try:
            values = json.loads(cipher().decrypt(row.payload.encode()))
        except InvalidToken, ValueError, TypeError:
            row.payload = None
            row.failed_at = utcnow()
            logger.error("outbox_payload_invalid invitation_id=%s", row.invitation_id)
            return True
        settings = get_settings()
        message = invitation_message(
            values["recipient"], values["token"], row.invitation_id, settings
        )
        sender = SMTPPasswordResetSender(
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_from_email,
            settings.invitation_url,
            settings.smtp_username,
            settings.smtp_password,
            settings.smtp_starttls,
        )
        try:
            await asyncio.to_thread(sender._send, message)
        except Exception as exc:
            row.attempts += 1
            if row.attempts >= 5:
                row.failed_at = utcnow()
                row.payload = None
            else:
                row.available_at = utcnow() + timedelta(seconds=min(3600, 30 * 2**row.attempts))
            logger.warning(
                "outbox_delivery_failed invitation_id=%s exception_type=%s",
                row.invitation_id,
                type(exc).__name__,
            )
        else:
            row.delivered_at = utcnow()
            row.payload = None
        return True


async def run_worker():
    while True:
        try:
            delivered = await deliver_one()
        except SQLAlchemyError as exc:
            logger.error("outbox_database_unavailable exception_type=%s", type(exc).__name__)
            await asyncio.sleep(5)
            continue
        if not delivered:
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(run_worker())
