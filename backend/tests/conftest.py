import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/mais_saude_test"
)
os.environ.setdefault("JWT_SECRET", "test-secret-with-at-least-thirty-two-characters")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTH_RATE_LIMIT", "10000")


from uuid import uuid7

import pytest


@pytest.fixture
def make_cpf():
    def generate():
        digits = str(uuid7().int % 1_000_000_000).zfill(9)
        for size in (9, 10):
            total = sum(int(digit) * (size + 1 - index) for index, digit in enumerate(digits))
            digits += str((total * 10 % 11) % 10)
        return digits

    return generate
