from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid7

import jwt
from jwt.exceptions import InvalidTokenError


class JWTService:
    def __init__(self, secret_key: str, algorithm: str, expiration_minutes: int) -> None:
        self._secret_key = secret_key
        self._algorithm = algorithm
        self._expiration_minutes = expiration_minutes

    def create_access_token(self, user_id: UUID) -> str:
        now = datetime.now(UTC)
        payload = {
            "sub": str(user_id),
            "type": "access",
            "jti": str(uuid7()),
            "iat": now,
            "exp": now + timedelta(minutes=self._expiration_minutes),
        }
        return jwt.encode(payload, self._secret_key, algorithm=self._algorithm)

    def decode_access_token(self, token: str) -> dict[str, Any]:
        try:
            payload = jwt.decode(token, self._secret_key, algorithms=[self._algorithm])
        except InvalidTokenError as error:
            raise ValueError("Token inválido ou expirado.") from error

        if payload.get("type") != "access":
            raise ValueError("Tipo de token inválido.")
        return payload
