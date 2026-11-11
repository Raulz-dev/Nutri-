import base64
import binascii
import json

import httpx
from pydantic import BaseModel, SecretStr, ValidationError

from app.config.settings import Settings
from app.uazapi.limits import MAX_DOWNLOAD, MAX_DOWNLOAD_BODY


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


def _request(
    settings: Settings,
    method: str,
    path: str,
    body: dict | None = None,
    *,
    response_limit: int | None = None,
) -> dict:
    if not settings.uazapi_base_url or not settings.uazapi_instance_token:
        raise UazapiError("not_configured")
    try:
        with httpx.Client(
            timeout=settings.uazapi_timeout_seconds, follow_redirects=False
        ) as client:
            url = f"{str(settings.uazapi_base_url).rstrip('/')}{path}"
            headers = {"token": settings.uazapi_instance_token.get_secret_value()}
            if response_limit is not None:
                with client.stream(method, url, headers=headers, json=body) as response:
                    response.raise_for_status()
                    buffered = bytearray()
                    for chunk in response.iter_bytes(chunk_size=64 * 1024):
                        if len(buffered) + len(chunk) > response_limit:
                            raise UazapiError("media_too_large")
                        buffered.extend(chunk)
                    payload = json.loads(buffered)
            else:
                if method == "POST":
                    response = client.post(
                        url, headers=headers, json=body if body is not None else {}
                    )
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
            else "rejected"
            if body is not None and 400 <= code < 500 and code != 408
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


def instance_identity(settings: Settings) -> str:
    payload = _request(settings, "GET", "/instance/status")
    instance = payload.get("instance")
    instance_id = instance.get("id") if isinstance(instance, dict) else None
    if not isinstance(instance_id, str) or not instance_id.strip() or len(instance_id) > 200:
        raise UazapiError("invalid_response")
    return instance_id


def send_text(settings: Settings, destination: str, text: str, tracking_id: str) -> dict:
    return _request(
        settings,
        "POST",
        "/send/text",
        {
            "number": destination,
            "text": text,
            "async": False,
            "track_source": "mais-saude",
            "track_id": tracking_id,
        },
    )


def provision_instance(settings: Settings, name: str, *, create: bool) -> tuple[str, SecretStr]:
    try:
        with httpx.Client(
            timeout=settings.uazapi_timeout_seconds, follow_redirects=False
        ) as client:
            base = str(settings.uazapi_base_url).rstrip("/")
            headers = {"admintoken": settings.uazapi_admin_token.get_secret_value()}
            if create:
                response = client.post(
                    f"{base}/instance/create", headers=headers, json={"name": name}
                )
            else:
                response = client.get(f"{base}/instance/all", headers=headers)
            if create and response.status_code in (400, 401, 403, 404, 422, 429):
                raise UazapiError("provision_rejected")
            response.raise_for_status()
            body = response.json()
    except httpx.TimeoutException:
        raise UazapiError("timeout") from None
    except httpx.HTTPError, ValueError:
        raise UazapiError("unavailable") from None

    if create and isinstance(body, dict):
        instance = body.get("instance", body)
        if isinstance(instance, dict):
            instance = {**instance, "token": body.get("token") or instance.get("token")}
    elif not create and isinstance(body, list):
        matches = [row for row in body if isinstance(row, dict) and row.get("name") == name]
        if not matches:
            raise UazapiError("provision_missing")
        if len(matches) != 1:
            raise UazapiError("provision_pending")
        instance = matches[0]
    else:
        raise UazapiError("invalid_response")
    if not isinstance(instance, dict):
        raise UazapiError("invalid_response")
    instance_id, token = instance.get("id"), instance.get("token")
    if not isinstance(instance_id, str) or not 0 < len(instance_id) <= 200:
        raise UazapiError("invalid_response")
    if not isinstance(token, str) or not token.strip():
        raise UazapiError("invalid_response")
    return instance_id, SecretStr(token)


def configure_instance_webhook(settings: Settings, url: str) -> None:
    _request(
        settings,
        "POST",
        "/webhook",
        {
            "enabled": True,
            "url": url,
            "events": ["messages", "messages_update"],
            "addUrlEvents": False,
            "addUrlTypesMessages": False,
        },
    )


def download_media(settings: Settings, message_id: str) -> dict[str, str]:
    payload = _request(
        settings,
        "POST",
        "/message/download",
        {"id": message_id, "return_base64": True},
        response_limit=MAX_DOWNLOAD_BODY,
    )
    mime = payload.get("mimetype")
    encoded = payload.get("base64Data")
    if not isinstance(mime, str) or not isinstance(encoded, str):
        raise UazapiError("invalid_response")
    mime = mime.split(";", 1)[0].strip().lower()
    allowed = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "audio/ogg",
        "audio/opus",
        "audio/mpeg",
        "audio/mp4",
        "audio/aac",
        "audio/wav",
        "audio/webm",
        "application/pdf",
    }
    if mime not in allowed:
        raise UazapiError("unsupported_media")
    if encoded.startswith("data:"):
        encoded = encoded.partition(",")[2]
    limit = MAX_DOWNLOAD
    if len(encoded) > 4 * ((limit + 2) // 3):
        raise UazapiError("media_too_large")
    try:
        contents = base64.b64decode(encoded, validate=True)
    except ValueError, binascii.Error:
        raise UazapiError("invalid_response") from None
    if len(contents) > limit:
        raise UazapiError("media_too_large")
    if not contents or (mime == "application/pdf" and not contents.startswith(b"%PDF-")):
        raise UazapiError("invalid_response")
    return {"mime_type": mime, "base64": encoded}


def chat_avatar(settings: Settings, chat_id: str) -> str | None:
    from urllib.parse import urlsplit

    payload = _request(settings, "POST", "/chat/avatar", {"number": chat_id, "preview": True})
    url = payload.get("url")
    if not isinstance(url, str) or not url or len(url) > 4096:
        return None
    try:
        parsed = urlsplit(url)
        if (
            parsed.scheme == "https"
            and parsed.hostname
            and not (parsed.username or parsed.password)
        ):
            return url
    except ValueError:
        pass
    return None


def send_media(
    settings: Settings,
    destination: str,
    media_type: str,
    mime_type: str,
    encoded: str,
    filename: str,
    text: str,
    tracking_id: str,
) -> dict:
    payload = {
        "number": destination,
        "type": media_type,
        "file": f"data:{mime_type};base64,{encoded}",
        "async": False,
        "track_source": "mais-saude",
        "track_id": tracking_id,
    }
    if media_type != "audio" and text:
        payload["text"] = text
    if media_type == "document":
        payload["docName"] = filename
    return _request(settings, "POST", "/send/media", payload)


def find_messages(settings: Settings, offset: int) -> tuple[list, int | None]:
    payload = _request(
        settings,
        "POST",
        "/message/find",
        {"limit": 50, "offset": offset},
        response_limit=8 * 1024 * 1024,
    )
    messages = payload.get("messages")
    pagination = payload.get("pagination")
    if not isinstance(messages, list) or not isinstance(pagination, dict):
        raise UazapiError("invalid_response")
    has_more = pagination.get("hasMore")
    if has_more is False:
        return messages, None
    next_offset = pagination.get("nextOffset")
    if has_more is not True or type(next_offset) is not int or next_offset <= offset:
        raise UazapiError("invalid_response")
    return messages, next_offset
