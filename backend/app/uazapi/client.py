import base64
import binascii

import httpx
from pydantic import BaseModel, ValidationError

from app.config.settings import Settings


class ConnectionStatus(BaseModel):
    connected: bool
    logged_in: bool


class PairingStatus(ConnectionStatus):
    state: str
    qr_code: str | None = None


class UazapiError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _request(settings: Settings, method: str, path: str) -> dict:
    if not settings.uazapi_base_url or not settings.uazapi_instance_token:
        raise UazapiError("not_configured")
    try:
        with httpx.Client(
            timeout=settings.uazapi_timeout_seconds, follow_redirects=False
        ) as client:
            url = f"{str(settings.uazapi_base_url).rstrip('/')}{path}"
            headers = {"token": settings.uazapi_instance_token.get_secret_value()}
            if method == "POST":
                response = client.post(url, headers=headers, json={})
            else:
                response = client.get(url, headers=headers)
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict):
            raise UazapiError("invalid_response")
        return payload
    except httpx.TimeoutException:
        raise UazapiError("timeout") from None
    except httpx.HTTPStatusError as error:
        code = error.response.status_code
        reason = (
            "invalid_credentials"
            if code == 401
            else "connection_in_progress"
            if code == 409
            else "provider_error"
        )
        raise UazapiError(reason) from None
    except httpx.RequestError:
        raise UazapiError("unavailable") from None
    except ValueError, KeyError, ValidationError:
        raise UazapiError("invalid_response") from None


def _connection(payload: dict) -> ConnectionStatus:
    status = payload.get("status", payload)
    if not isinstance(status, dict):
        raise UazapiError("invalid_response")
    try:
        return ConnectionStatus(connected=status["connected"], logged_in=status["loggedIn"])
    except KeyError, ValidationError:
        raise UazapiError("invalid_response") from None


def connection_status(settings: Settings) -> ConnectionStatus:
    return _connection(_request(settings, "GET", "/instance/status"))


def _pairing(payload: dict) -> PairingStatus:
    connection = _connection(payload)
    instance = payload.get("instance")
    if not isinstance(instance, dict):
        raise UazapiError("invalid_response")
    state = "connected" if connection.connected else instance.get("status")
    if not isinstance(state, str):
        raise UazapiError("invalid_response")
    qr_code = None
    raw = instance.get("qrcode")
    if not connection.connected and state == "connecting" and raw:
        if not isinstance(raw, str) or len(raw) > 2_000_000:
            raise UazapiError("invalid_response")
        encoded = raw.removeprefix("data:image/png;base64,")
        try:
            image = base64.b64decode(encoded, validate=True)
        except ValueError, binascii.Error:
            raise UazapiError("invalid_response") from None
        if not image.startswith(b"\x89PNG\r\n\x1a\n"):
            raise UazapiError("invalid_response")
        qr_code = f"data:image/png;base64,{encoded}"
    return PairingStatus(**connection.model_dump(), state=state, qr_code=qr_code)


def pairing_status(settings: Settings) -> PairingStatus:
    return _pairing(_request(settings, "GET", "/instance/status"))


def connect_instance(settings: Settings) -> PairingStatus:
    current = pairing_status(settings)
    if current.connected or current.state not in ("disconnected", "hibernated"):
        return current
    try:
        return _pairing(_request(settings, "POST", "/instance/connect"))
    except UazapiError as error:
        if error.code == "connection_in_progress":
            return pairing_status(settings)
        raise
