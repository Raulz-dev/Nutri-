import argparse
import os
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy.engine import make_url

from app.config.settings import get_settings

CONNECTION_OPTIONS = {
    "sslmode": "PGSSLMODE",
    "sslrootcert": "PGSSLROOTCERT",
    "sslcert": "PGSSLCERT",
    "sslkey": "PGSSLKEY",
    "connect_timeout": "PGCONNECT_TIMEOUT",
    "target_session_attrs": "PGTARGETSESSIONATTRS",
    "application_name": "PGAPPNAME",
    "options": "PGOPTIONS",
}


def postgres_connection():
    settings = get_settings()
    url = make_url(settings.database_url)
    if not url.drivername.startswith("postgresql") or not url.database:
        raise ValueError("DATABASE_URL deve apontar para um banco PostgreSQL nomeado.")
    environment = os.environ.copy()
    for key in ("PGPASSWORD", "PGHOST", "PGPORT", "PGUSER"):
        environment.pop(key, None)
    if url.password:
        environment["PGPASSWORD"] = url.password
    if url.host:
        environment["PGHOST"] = url.host
    if url.port:
        environment["PGPORT"] = str(url.port)
    if url.username:
        environment["PGUSER"] = url.username
    for option, value in url.query.items():
        if option not in CONNECTION_OPTIONS or not isinstance(value, str):
            raise ValueError(f"Parâmetro de conexão PostgreSQL não suportado: {option}.")
        environment[CONNECTION_OPTIONS[option]] = value
    return settings, url.database, environment


def backup(destination: Path) -> None:
    _, database, environment = postgres_connection()
    if destination.exists():
        raise ValueError("O arquivo de backup já existe.")
    with tempfile.NamedTemporaryFile(
        prefix=".backup-", suffix=".dump", dir=destination.parent, delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        temporary_path.chmod(0o600)
        subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-privileges",
                "--file",
                str(temporary_path),
                database,
            ],
            check=True,
            env=environment,
        )
        subprocess.run(
            ["pg_restore", "--list", str(temporary_path)], check=True, stdout=subprocess.DEVNULL
        )
        try:
            os.link(temporary_path, destination)
        except FileExistsError as error:
            raise ValueError("O arquivo de backup já existe.") from error
    finally:
        temporary_path.unlink(missing_ok=True)


def restore(source: Path, confirmation: str) -> None:
    settings, database, environment = postgres_connection()
    if settings.app_env not in ("development", "test"):
        raise ValueError("Restauração por este comando é permitida somente em dev ou teste.")
    if confirmation != database:
        raise ValueError("Confirme o nome exato do banco de destino.")
    if not source.is_file():
        raise ValueError("Arquivo de backup não encontrado.")
    subprocess.run(["pg_restore", "--list", str(source)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(
        [
            "pg_restore",
            "--exit-on-error",
            "--single-transaction",
            "--no-owner",
            "--no-privileges",
            "--dbname",
            database,
            str(source),
        ],
        check=True,
        env=environment,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backup e restauração de PostgreSQL em desenvolvimento."
    )
    actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("backup").add_argument("file", type=Path)
    restore_parser = actions.add_parser("restore")
    restore_parser.add_argument("file", type=Path)
    restore_parser.add_argument("--confirm-db", required=True)
    arguments = parser.parse_args()
    try:
        if arguments.action == "backup":
            backup(arguments.file)
        else:
            restore(arguments.file, arguments.confirm_db)
    except (ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Falha: {error}\n")


if __name__ == "__main__":
    main()
