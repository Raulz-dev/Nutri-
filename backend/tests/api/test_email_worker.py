import asyncio
from uuid import uuid4

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.care import email_worker
from app.config.settings import get_settings


def test_invitation_email_has_welcome_photo_and_text_fallback():
    message = email_worker.invitation_message(
        "nutricionista@example.com", "token-test", uuid4(), get_settings()
    )
    plain = message.get_body(preferencelist=("plain",))
    html = message.get_body(preferencelist=("html",))
    image = next(part for part in message.walk() if part.get_content_type() == "image/jpeg")

    assert "Boas-vindas" in message["Subject"]
    assert "token=token-test" in plain.get_content()
    assert "Boas-vindas ao Nutri +" in html.get_content()
    assert "cid:nutri-welcome" in html.get_content()
    assert image["Content-ID"] == "<nutri-welcome>"
    assert image.get_payload(decode=True)


@pytest.mark.asyncio
async def test_worker_retries_after_temporary_database_failure(monkeypatch):
    calls = 0
    sleeps = 0

    async def deliver():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise SQLAlchemyError("temporary database failure")
        return False

    async def sleep(_seconds):
        nonlocal sleeps
        sleeps += 1
        if sleeps == 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(email_worker, "deliver_one", deliver)
    monkeypatch.setattr(email_worker.asyncio, "sleep", sleep)

    with pytest.raises(asyncio.CancelledError):
        await email_worker.run_worker()

    assert calls == 2
    assert sleeps == 2
