from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config.settings import Settings, get_settings
from app.operations import configure_operations
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


@pytest.mark.parametrize(
    ("code", "expected_status", "message"),
    [
        ("not_configured", 503, "A conexão com o WhatsApp ainda não foi configurada."),
        ("timeout", 504, "A consulta ao WhatsApp demorou demais. Tente novamente."),
        (
            "invalid_credentials",
            502,
            "Não foi possível autenticar a conexão com o WhatsApp.",
        ),
        (
            "unavailable",
            502,
            "Não foi possível conectar ao serviço do WhatsApp. Tente novamente.",
        ),
        ("invalid_response", 502, "O serviço do WhatsApp retornou uma resposta inválida."),
        ("provider_error", 502, "Não foi possível consultar a conexão com o WhatsApp."),
        ("unknown_internal_code", 502, "Não foi possível consultar a conexão com o WhatsApp."),
    ],
)
def test_connection_errors_use_application_error_contract(code, expected_status, message):
    owner = uuid4()
    settings = config(uazapi_nutritionist_id=owner)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    configure_operations(app)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=owner, role=UserRole.NUTRITIONIST
    )
    with (
        TestClient(app) as client,
        patch("app.uazapi.router.connection_status", side_effect=UazapiError(code)),
    ):
        response = client.get("/api/v1/whatsapp/uazapi/connection")
    assert response.status_code == expected_status
    body = response.json()
    assert body["detail"] == message
    assert body["error"]["message"] == message
    assert body["error"]["code"] == f"http_{expected_status}"
    assert body["error"]["request_id"]


def instance_payload(state, qr=None):
    return {
        "status": {"connected": state == "connected", "loggedIn": state == "connected"},
        "instance": {"status": state, "qrcode": qr, "token": "never-return-this"},
    }


@pytest.mark.parametrize("state", ["connected", "connecting"])
def test_connect_preserves_existing_session_and_pairing(state):
    from app.uazapi.client import connect_instance

    with patch("app.uazapi.client._request", return_value=instance_payload(state)) as request:
        result = connect_instance(config())
    assert result.state == state
    assert request.call_count == 1
    assert request.call_args.args[1:] == ("GET", "/instance/status")
    assert "never-return-this" not in result.model_dump_json()


@pytest.mark.parametrize("prefix", ["", "data:image/png;base64,"])
def test_connect_returns_only_sanitized_qr_and_connection_flags(prefix):
    import base64

    from app.uazapi.client import connect_instance

    png = base64.b64encode(b"\x89PNG\r\n\x1a\nsynthetic-image").decode()
    with patch(
        "app.uazapi.client._request",
        side_effect=[
            instance_payload("disconnected"),
            instance_payload("connecting", prefix + png),
        ],
    ) as request:
        result = connect_instance(config())
    assert request.call_args.args[1:] == ("POST", "/instance/connect")
    assert result.qr_code == "data:image/png;base64," + png
    assert not result.connected
    assert "never-return-this" not in result.model_dump_json()


def test_connected_status_discards_obsolete_qr():
    from app.uazapi.client import pairing_status

    with patch("app.uazapi.client._request", return_value=instance_payload("connected", "old-qr")):
        assert pairing_status(config()).qr_code is None


def test_connect_conflict_reconciles_without_repeating_mutation():
    from app.uazapi.client import connect_instance

    with patch(
        "app.uazapi.client._request",
        side_effect=[
            instance_payload("disconnected"),
            UazapiError("connection_in_progress"),
            instance_payload("connecting"),
        ],
    ) as request:
        assert connect_instance(config()).state == "connecting"
    assert [call.args[1] for call in request.call_args_list] == ["GET", "POST", "GET"]


@pytest.mark.parametrize("qr", ["https://example.com/qr", "data:image/svg+xml;base64,abc", 123])
def test_pairing_rejects_invalid_qr(qr):
    from app.uazapi.client import pairing_status

    with patch("app.uazapi.client._request", return_value=instance_payload("connecting", qr)):
        with pytest.raises(UazapiError, match="invalid_response"):
            pairing_status(config())


@pytest.mark.parametrize("method,path", [("GET", "pairing"), ("POST", "connect")])
def test_pairing_endpoints_require_owner_and_disable_caching(method, path):
    from app.uazapi.client import PairingStatus

    owner = uuid4()
    actor = SimpleNamespace(id=uuid4(), role=UserRole.NUTRITIONIST)
    app = FastAPI()
    app.include_router(router)
    configure_operations(app)
    app.dependency_overrides[get_settings] = lambda: config(uazapi_nutritionist_id=owner)
    app.dependency_overrides[get_current_user] = lambda: actor
    upstream_name = "pairing_status" if method == "GET" else "connect_instance"
    with TestClient(app) as client, patch("app.uazapi.router." + upstream_name) as upstream:
        assert client.request(method, "/whatsapp/uazapi/" + path).status_code == 403
        upstream.assert_not_called()
        actor.id = owner
        upstream.return_value = PairingStatus(connected=False, logged_in=False, state="connecting")
        response = client.request(method, "/whatsapp/uazapi/" + path)
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert response.json()["state"] == "connecting"
        upstream.side_effect = UazapiError("timeout")
        response = client.request(method, "/whatsapp/uazapi/" + path)
        assert response.status_code == 504
        assert (
            response.json()["detail"] == "A consulta ao WhatsApp demorou demais. Tente novamente."
        )


def test_connect_transport_posts_empty_body_with_instance_token():
    from app.uazapi.client import connect_instance

    settings = config(uazapi_base_url="https://example.com", uazapi_instance_token="secret")
    with patch("app.uazapi.client.httpx.Client") as factory:
        client = factory.return_value.__enter__.return_value
        client.get.return_value = httpx.Response(
            200,
            json=instance_payload("disconnected"),
            request=httpx.Request("GET", "https://example.com/instance/status"),
        )
        client.post.return_value = httpx.Response(
            200,
            json=instance_payload("connecting"),
            request=httpx.Request("POST", "https://example.com/instance/connect"),
        )
        assert connect_instance(settings).state == "connecting"
        client.post.assert_called_once_with(
            "https://example.com/instance/connect", headers={"token": "secret"}, json={}
        )
