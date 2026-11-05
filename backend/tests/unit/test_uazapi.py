from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config.settings import Settings, get_settings
from app.uazapi.client import UazapiError, connection_status
from app.uazapi.router import router
from app.users.domain.enums import UserRole
from app.users.presentation.dependencies import get_current_user


def config(**values):
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://localhost/test",
        jwt_secret="x" * 32,
        **values,
    )


def test_configuration_protects_credentials_and_requires_https():
    settings = config(uazapi_instance_token="synthetic-private-token")
    assert "synthetic-private-token" not in repr(settings)
    with pytest.raises(ValidationError):
        config(uazapi_base_url="http://example.com")
    with pytest.raises(ValidationError):
        config(uazapi_base_url="https://example.com?token=secret")


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (httpx.Response(401), "invalid_credentials"),
        (httpx.Response(429), "provider_error"),
        (httpx.Response(500), "provider_error"),
        (httpx.Response(200, json={"status": {}}), "invalid_response"),
        (httpx.Response(200, json=[]), "invalid_response"),
    ],
)
def test_provider_errors_are_sanitized_and_not_retried(response, expected):
    response.request = httpx.Request("GET", "https://example.com/instance/status")
    with patch("app.uazapi.client.httpx.Client") as transport:
        transport.return_value.__enter__.return_value.get.return_value = response
        with pytest.raises(UazapiError, match=expected):
            connection_status(
                config(uazapi_base_url="https://example.com", uazapi_instance_token="secret")
            )
        assert transport.return_value.__enter__.return_value.get.call_count == 1


def test_status_route_enforces_ownership_and_returns_only_flags():
    owner = uuid4()
    settings = config(uazapi_nutritionist_id=owner)
    actor = SimpleNamespace(id=uuid4(), role=UserRole.NUTRITIONIST)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_current_user] = lambda: actor
    with TestClient(app) as client, patch("app.uazapi.router.connection_status") as upstream:
        assert client.get("/whatsapp/uazapi/connection").status_code == 403
        upstream.assert_not_called()
        actor.id = owner
        upstream.return_value = {"connected": True, "logged_in": True, "token": "secret"}
        assert client.get("/whatsapp/uazapi/connection").json() == {
            "connected": True,
            "logged_in": True,
        }
        upstream.side_effect = UazapiError("timeout")
        assert client.get("/whatsapp/uazapi/connection").status_code == 504
        upstream.side_effect = UazapiError("not_configured")
        assert client.get("/whatsapp/uazapi/connection").status_code == 503


def test_transport_timeout_is_sanitized():
    with patch("app.uazapi.client.httpx.Client") as transport:
        transport.return_value.__enter__.return_value.get.side_effect = httpx.ReadTimeout("secret")
        with pytest.raises(UazapiError, match="^timeout$"):
            connection_status(
                config(uazapi_base_url="https://example.com", uazapi_instance_token="secret")
            )
