import asyncio
import json
import logging
import secrets
import time
from collections import OrderedDict
from contextvars import ContextVar
from uuid import UUID, uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest
from sqlalchemy import func, select, text
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response

from app.config.settings import get_settings
from app.database.session import AsyncSessionLocal
from app.users.domain.exceptions import UserError

actor_id: ContextVar[UUID | None] = ContextVar("actor_id", default=None)
request_id: ContextVar[str] = ContextVar("request_id", default="")
logger = logging.getLogger("nutri.requests")
registry = CollectorRegistry()
requests = Counter(
    "http_requests_total", "Completed requests", ["method", "route", "status"], registry=registry
)
latency = Histogram(
    "http_request_duration_seconds", "Request latency", ["method", "route"], registry=registry
)
outbox_pending = Gauge("email_outbox_pending", "Invitations pending delivery", registry=registry)
outbox_failed = Gauge("email_outbox_failed", "Invitations with failed delivery", registry=registry)


def error_response(status: int, detail: str, headers=None):
    return JSONResponse(
        {
            "detail": detail,
            "error": {"code": f"http_{status}", "message": detail, "request_id": request_id.get()},
        },
        status_code=status,
        headers=headers,
    )


class TelemetryMiddleware:
    def __init__(self, app):
        self.app = app
        self.attempts = OrderedDict()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        rid = str(uuid4())
        request_context = request_id.set(rid)
        actor_context = actor_id.set(None)
        start = time.monotonic()
        status = 500
        started = False

        async def safe_send(message):
            nonlocal status, started
            if message["type"] == "http.response.start":
                started = True
                status = message["status"]
                message["headers"] += [
                    (b"x-request-id", rid.encode()),
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                ]
            await send(message)

        try:
            path = scope["path"]
            if scope["method"] == "POST" and (
                path.startswith("/api/v1/auth/") or path == "/api/v1/users"
            ):
                key = (scope.get("client") or ("unknown",))[0]
                now = time.monotonic()
                count, since = self.attempts.pop(key, (0, now))
                if now - since >= 60:
                    count, since = 0, now
                self.attempts[key] = (count + 1, since)
                if len(self.attempts) > 10000:
                    self.attempts.popitem(last=False)
                if count >= get_settings().auth_rate_limit:
                    return await error_response(
                        429,
                        "Muitas tentativas. Tente novamente em instantes.",
                        {"Retry-After": "60"},
                    )(scope, receive, safe_send)
            await self.app(scope, receive, safe_send)
        except Exception as exc:
            logger.error(
                json.dumps(
                    {
                        "event": "request_failed",
                        "request_id": rid,
                        "exception_type": type(exc).__name__,
                    }
                )
            )
            if started:
                raise
            await error_response(500, "Não foi possível concluir a solicitação.")(
                scope, receive, safe_send
            )
        finally:
            route = getattr(scope.get("route"), "path", "unmatched")
            method = (
                scope["method"]
                if scope["method"] in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
                else "OTHER"
            )
            elapsed = time.monotonic() - start
            requests.labels(method, route, str(status)).inc()
            latency.labels(method, route).observe(elapsed)
            logger.info(
                json.dumps(
                    {
                        "event": "request_completed",
                        "request_id": rid,
                        "method": method,
                        "route": route,
                        "status": status,
                        "duration_ms": round(elapsed * 1000, 2),
                    }
                )
            )
            actor_id.reset(actor_context)
            request_id.reset(request_context)


def configure_operations(app: FastAPI):
    logging.getLogger("uvicorn.access").disabled = True
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    app.add_middleware(TelemetryMiddleware)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error_response(exc.status_code, str(exc.detail), exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return error_response(422, "Confira os campos informados e seus limites.")

    @app.exception_handler(UserError)
    async def domain_error(request: Request, exc: UserError):
        from app.users.domain.exceptions import UserAccessDeniedError, UserConflictError

        status = (
            403
            if isinstance(exc, UserAccessDeniedError)
            else 409
            if isinstance(exc, UserConflictError)
            else 422
        )
        return error_response(status, str(exc))

    @app.get("/ready", tags=["Health"])
    async def ready():
        try:
            async with asyncio.timeout(3), AsyncSessionLocal() as db:
                await db.execute(text("SELECT 1"))
        except Exception:
            return error_response(503, "Serviço temporariamente indisponível.")
        return {"status": "ready"}

    @app.get("/metrics", include_in_schema=False)
    async def metrics(request: Request):
        token = get_settings().metrics_token
        if not token or not secrets.compare_digest(
            request.headers.get("Authorization", ""), f"Bearer {token}"
        ):
            return error_response(404, "Recurso não encontrado.")
        from app.care.models import EmailOutboxModel

        try:
            async with asyncio.timeout(3), AsyncSessionLocal() as db:
                outbox_pending.set(
                    await db.scalar(
                        select(func.count())
                        .select_from(EmailOutboxModel)
                        .where(
                            EmailOutboxModel.payload.is_not(None),
                            EmailOutboxModel.failed_at.is_(None),
                        )
                    )
                    or 0
                )
                outbox_failed.set(
                    await db.scalar(
                        select(func.count())
                        .select_from(EmailOutboxModel)
                        .where(EmailOutboxModel.failed_at.is_not(None))
                    )
                    or 0
                )
        except Exception:
            return error_response(503, "Métricas indisponíveis.")
        return Response(generate_latest(registry), media_type="text/plain; version=0.0.4")
