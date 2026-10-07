from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.care.audit_router import router as audit_router
from app.care.invites import router as invites_router
from app.care.link_invitations import router as link_invitations_router
from app.care.router import router as care_router
from app.config.settings import get_settings
from app.operations import configure_operations
from app.users.presentation.auth_router import router as auth_router
from app.users.presentation.router import router as users_router

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(users_router)
api_v1.include_router(auth_router)
api_v1.include_router(care_router)
api_v1.include_router(invites_router)
api_v1.include_router(link_invitations_router)
api_v1.include_router(audit_router)
app.include_router(api_v1)
configure_operations(app)


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "healthy", "environment": settings.app_env}
