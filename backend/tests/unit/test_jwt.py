from uuid import uuid7

import pytest

from app.security.jwt import JWTService


def test_access_token_round_trip() -> None:
    service = JWTService("a-secret-key-with-at-least-32-chars", "HS256", 15)
    user_id = uuid7()

    payload = service.decode_access_token(service.create_access_token(user_id))

    assert payload["sub"] == str(user_id)
    assert payload["type"] == "access"
    assert payload["jti"]


def test_rejects_invalid_token() -> None:
    service = JWTService("a-secret-key-with-at-least-32-chars", "HS256", 15)

    with pytest.raises(ValueError):
        service.decode_access_token("invalid-token")
