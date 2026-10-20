from cryptography.fernet import Fernet

from app.config.settings import get_settings


def cipher():
    key = get_settings().outbox_encryption_key
    if not key:
        raise RuntimeError("OUTBOX_ENCRYPTION_KEY não configurada.")
    return Fernet(key.encode())
