from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import get_settings
from app.users.presentation.auth_router import router as auth_router
from app.users.presentation.router import router as users_router

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(users_router)
api_v1.include_router(auth_router)
app.include_router(api_v1)


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "healthy", "environment": settings.app_env}
