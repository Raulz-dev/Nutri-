from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "+Saúde API"
    app_env: Literal["development", "test", "production"] = "development"
    debug: bool = False
    database_url: str
    sql_echo: bool = False

    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expiration_minutes: int = Field(default=15, gt=0)
    refresh_token_expiration_days: int = Field(default=7, gt=0)
    password_reset_expiration_minutes: int = Field(default=30, gt=0)

    smtp_host: str = "localhost"
    smtp_port: int = Field(default=1025, gt=0, le=65535)
    smtp_from_email: str = "nao-responda@maissaude.local"
    password_reset_url: str = "http://localhost:5173/redefinir-senha"
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
