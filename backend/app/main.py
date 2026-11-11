from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.care.account_router import router as account_router
from app.care.audit_router import router as audit_router
from app.care.clinical_router import router as clinical_router
from app.care.dashboard_router import router as dashboard_router
from app.care.interaction_router import router as interaction_router
from app.care.invites import router as invites_router
from app.care.link_invitations import router as link_invitations_router
from app.care.nutritionist_applications import router as nutritionist_applications_router
from app.care.plan_router import router as plan_router
from app.care.router import router as care_router
from app.care.support_router import router as support_router
from app.config.settings import get_settings
from app.operations import configure_operations
from app.security.rate_limit import limit_sensitive_requests
from app.uazapi.messaging import router as uazapi_messaging_router
from app.uazapi.router import router as uazapi_router
from app.uazapi.webhook import router as uazapi_webhook_router
from app.users.presentation.auth_router import router as auth_router
from app.users.presentation.router import router as users_router
from app.whatsapp.realtime import router as whatsapp_realtime_router
from app.whatsapp.router import router as whatsapp_router

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Retry-After"],
)

api_v1 = APIRouter(prefix="/api/v1", dependencies=[Depends(limit_sensitive_requests)])
api_v1.include_router(users_router)
api_v1.include_router(auth_router)
api_v1.include_router(care_router)
api_v1.include_router(clinical_router)
api_v1.include_router(plan_router)
api_v1.include_router(interaction_router)
api_v1.include_router(invites_router)
api_v1.include_router(nutritionist_applications_router)
api_v1.include_router(link_invitations_router)
api_v1.include_router(audit_router)
api_v1.include_router(dashboard_router)
api_v1.include_router(account_router)
api_v1.include_router(support_router)
api_v1.include_router(uazapi_router)
api_v1.include_router(uazapi_messaging_router)
api_v1.include_router(uazapi_webhook_router)
api_v1.include_router(whatsapp_router)
app.include_router(api_v1)
app.include_router(whatsapp_realtime_router, prefix="/api/v1")
configure_operations(app)


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "healthy", "environment": settings.app_env}
