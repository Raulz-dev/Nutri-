import hashlib
import hmac
from datetime import UTC, datetime, timedelta


def valid_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return bool(secret) and hmac.compare_digest(signature.encode(), expected.encode())


def window_open(last_inbound: datetime | None) -> bool:
    return bool(
        last_inbound and datetime.now(UTC) - timedelta(hours=24) < last_inbound <= datetime.now(UTC)
    )


def next_status(current: str, incoming: str) -> str:
    # Delivery/read evidence outranks errors and late sent acknowledgements.
    rank = {
        "queued": 0,
        "sending": 1,
        "unknown": 2,
        "sent": 3,
        "failed": 4,
        "delivered": 5,
        "read": 6,
    }
    return incoming if rank.get(incoming, -1) > rank.get(current, -1) else current
