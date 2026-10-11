from types import SimpleNamespace

import pytest

from app.cli import database_backup


def test_backup_connection_preserves_tls_requirements(monkeypatch):
    monkeypatch.setattr(
        database_backup,
        "get_settings",
        lambda: SimpleNamespace(
            database_url=(
                "postgresql+psycopg://test:secret@db.example.com:5433/nutri"
                "?sslmode=verify-full&sslrootcert=/certs/ca.pem"
            ),
            app_env="development",
        ),
    )
    _, database, environment = database_backup.postgres_connection()
    assert database == "nutri"
    assert environment["PGHOST"] == "db.example.com"
    assert environment["PGPORT"] == "5433"
    assert environment["PGSSLMODE"] == "verify-full"
    assert environment["PGSSLROOTCERT"] == "/certs/ca.pem"


def test_backup_rejects_unhandled_connection_options(monkeypatch):
    monkeypatch.setattr(
        database_backup,
        "get_settings",
        lambda: SimpleNamespace(
            database_url="postgresql+psycopg://test:secret@db.example.com/nutri?ssl_min_protocol_version=TLSv1.3",
            app_env="development",
        ),
    )
    with pytest.raises(ValueError, match="ssl_min_protocol_version"):
        database_backup.postgres_connection()
