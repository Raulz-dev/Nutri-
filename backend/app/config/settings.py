from functools import lru_cache
from typing import Literal
from uuid import UUID

from cryptography.fernet import Fernet
from pydantic import Field, HttpUrl, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Nutri + API"
    app_env: Literal["development", "test", "staging", "production"] = "development"
    debug: bool = False
    database_url: str
    sql_echo: bool = False

    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expiration_minutes: int = Field(default=15, gt=0)
    refresh_token_expiration_days: int = Field(default=7, gt=0)
    password_reset_expiration_minutes: int = Field(default=30, gt=0)
    invitation_expiration_hours: int = Field(default=24, gt=0)
    care_invitation_expiration_days: int = Field(default=7, gt=0)
    invitation_url: str = "http://localhost:5173/primeiro-acesso"
    outbox_encryption_key: str = ""
    metrics_token: str = ""
    max_request_bytes: int = Field(default=1048576, gt=0)
    auth_rate_limit: int = Field(default=30, gt=0)
    auth_account_rate_limit: int = Field(default=5, gt=0)
    auth_account_window_seconds: int = Field(default=900, gt=0)

    whatsapp_enabled: bool = False
    whatsapp_sends_enabled: bool = False
    whatsapp_pilot_nutritionist_id: UUID | None = None
    whatsapp_phone_number_id: str = Field(default="", pattern=r"^\d*$")
    whatsapp_graph_version: str = Field(default="", pattern=r"^(v\d+\.0)?$")
    whatsapp_access_token: str = Field(default="", repr=False)
    whatsapp_app_secret: str = Field(default="", repr=False)
    whatsapp_verify_token: str = Field(default="", repr=False)
    whatsapp_allowed_phones: list[str] = []

    uazapi_base_url: HttpUrl | None = None
    uazapi_admin_token: SecretStr = Field(default=SecretStr(""), repr=False)
    uazapi_webhook_base_url: HttpUrl | None = None
    uazapi_instance_token: SecretStr = Field(default=SecretStr(""), repr=False)
    uazapi_nutritionist_id: UUID | None = None
    uazapi_timeout_seconds: float = Field(default=15, gt=0, le=60)

    smtp_host: str = "localhost"
    smtp_port: int = Field(default=1025, gt=0, le=65535)
    smtp_from_email: str = "nao-responda@maissaude.local"
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    password_reset_url: str = "http://localhost:5173/redefinir-senha"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_operational_secrets(self):
        if self.uazapi_base_url:
            url = self.uazapi_base_url
            if url.scheme != "https" or url.username or url.password or url.query or url.fragment:
                raise ValueError("UAZAPI_BASE_URL exige HTTPS sem credenciais, query ou fragmento.")
        if self.uazapi_webhook_base_url:
            url = self.uazapi_webhook_base_url
            if url.scheme != "https" or url.username or url.password or url.query or url.fragment:
                raise ValueError(
                    "UAZAPI_WEBHOOK_BASE_URL exige HTTPS sem credenciais, query ou fragmento."
                )
        if self.whatsapp_enabled:
            if not all(
                (
                    self.whatsapp_pilot_nutritionist_id,
                    self.whatsapp_phone_number_id,
                    self.whatsapp_graph_version,
                    self.whatsapp_access_token,
                    self.whatsapp_app_secret,
                    self.whatsapp_verify_token,
                    self.outbox_encryption_key,
                    self.whatsapp_allowed_phones,
                )
            ):
                raise ValueError("Configure os campos WHATSAPP_* e OUTBOX_ENCRYPTION_KEY.")
            import re

            if any(not re.fullmatch(r"[1-9]\d{7,14}", p) for p in self.whatsapp_allowed_phones):
                raise ValueError("WHATSAPP_ALLOWED_PHONES exige DDI e números sem pontuação.")
        if self.app_env in ("staging", "production"):
            if not self.outbox_encryption_key or not self.metrics_token:
                raise ValueError("Configure OUTBOX_ENCRYPTION_KEY e METRICS_TOKEN.")
            if not self.smtp_starttls:
                raise ValueError("SMTP_STARTTLS é obrigatório em homologação e produção.")
        if self.outbox_encryption_key:
            try:
                Fernet(self.outbox_encryption_key.encode())
            except ValueError as error:
                raise ValueError("OUTBOX_ENCRYPTION_KEY inválida.") from error
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
