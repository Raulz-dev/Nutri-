import httpx
from pydantic import BaseModel, ValidationError

from app.config.settings import Settings


class ConnectionStatus(BaseModel):
    connected: bool
    logged_in: bool


class UazapiError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def connection_status(settings: Settings) -> ConnectionStatus:
    if not settings.uazapi_base_url or not settings.uazapi_instance_token:
        raise UazapiError("not_configured")
    try:
        with httpx.Client(
            timeout=settings.uazapi_timeout_seconds, follow_redirects=False
        ) as client:
            response = client.get(
                f"{str(settings.uazapi_base_url).rstrip('/')}/instance/status",
                headers={"token": settings.uazapi_instance_token.get_secret_value()},
            )
            response.raise_for_status()
            payload = response.json()
        status = payload.get("status") if isinstance(payload, dict) else None
        if not isinstance(status, dict):
            raise UazapiError("invalid_response")
        # Return only connection flags, never the upstream instance object or credentials.
        return ConnectionStatus(connected=status["connected"], logged_in=status["loggedIn"])
    except httpx.TimeoutException:
        raise UazapiError("timeout") from None
    except httpx.HTTPStatusError as error:
        code = error.response.status_code
        raise UazapiError("invalid_credentials" if code == 401 else "provider_error") from None
    except httpx.RequestError:
        raise UazapiError("unavailable") from None
    except ValueError, KeyError, ValidationError:
        raise UazapiError("invalid_response") from None
