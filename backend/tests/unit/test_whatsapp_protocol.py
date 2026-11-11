import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError

from app.config.settings import Settings
from app.whatsapp.router import normalize_event
from app.whatsapp.service import next_status, valid_signature, window_open
from app.whatsapp.worker import send_to_meta


def test_signature_checks_exact_bytes():
    secret = "synthetic-app-secret"
    body = b'{"entry":[]}'
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert valid_signature(body, signature, secret)
    assert not valid_signature(body + b" ", signature, secret)
    assert not valid_signature(body, "assinatura inválida", secret)
    assert not valid_signature(body, "", secret)
    assert not valid_signature(body, signature, "")


def test_service_window():
    assert not window_open(None)
    assert window_open(datetime.now(UTC) - timedelta(hours=23))
    assert not window_open(datetime.now(UTC) - timedelta(hours=24, seconds=1))
    assert not window_open(datetime.now(UTC) + timedelta(hours=1))


@pytest.mark.parametrize(
    ("current", "incoming", "expected"),
    [
        ("sent", "failed", "failed"),
        ("failed", "sent", "failed"),
        ("delivered", "failed", "delivered"),
        ("read", "sent", "read"),
        ("unknown", "delivered", "delivered"),
        ("failed", "read", "read"),
    ],
)
def test_statuses_do_not_regress(current, incoming, expected):
    assert next_status(current, incoming) == expected


def test_normalize_ignores_media_malformed_and_future_events():
    event = {
        "id": "wamid.fake",
        "from": "5585999990000",
        "timestamp": str(int(datetime.now(UTC).timestamp())),
        "type": "image",
    }
    assert normalize_event("inbound", event) is None
    assert normalize_event("inbound", {**event, "type": "text", "text": "bad"}) is None
    assert normalize_event("inbound", {**event, "timestamp": {}, "type": "text"}) is None
    assert normalize_event("inbound", {**event, "type": "text", "text": {"body": " "}}) is None
    valid = normalize_event("inbound", {**event, "type": "text", "text": {"body": "Teste"}})
    assert valid["text"] == "Teste"


def test_enabled_pilot_requires_complete_configuration():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="postgresql+psycopg://localhost/test",
            jwt_secret="x" * 32,
            whatsapp_enabled=True,
        )


def test_meta_transport_never_retries_ambiguous_failures():
    from types import SimpleNamespace

    settings = SimpleNamespace(
        whatsapp_graph_version="v25.0",
        whatsapp_phone_number_id="123",
        whatsapp_access_token="synthetic-token",
    )
    with patch("app.whatsapp.worker.get_settings", return_value=settings):
        for error, expected in [
            (URLError("timeout"), "unknown"),
            (HTTPError("https://graph.facebook.com", 500, "error", {}, None), "unknown"),
            (HTTPError("https://graph.facebook.com", 400, "error", {}, None), "failed"),
        ]:
            with patch("app.whatsapp.worker.urlopen", side_effect=error) as transport:
                assert send_to_meta("5585999990000", "Teste fictício", uuid4())[0] == expected
                assert transport.call_count == 1

        class Response(BytesIO):
            pass

        with patch(
            "app.whatsapp.worker.urlopen",
            return_value=Response(json.dumps({"messages": [{"id": "wamid.test"}]}).encode()),
        ) as transport:
            local_id = uuid4()
            assert send_to_meta("5585999990000", "Teste", local_id) == ("sent", "wamid.test", None)
            payload = json.loads(transport.call_args.args[0].data)
            assert payload["biz_opaque_callback_data"] == str(local_id)


def test_secrets_not_in_settings_repr():
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://localhost/test",
        jwt_secret="x" * 32,
        whatsapp_app_secret="synthetic-secret",
        outbox_encryption_key=Fernet.generate_key().decode(),
    )
    assert "synthetic-secret" not in repr(settings)
