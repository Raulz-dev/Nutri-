"""Track UazAPI outbound delivery independently of request retries."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0016"
down_revision = "20261111_0015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("uazapi_messages", sa.Column("delivery_status", sa.String(16)))
    op.add_column("uazapi_messages", sa.Column("provider_message_id", sa.String(300)))
    op.create_index(
        "ix_uazapi_provider_message",
        "uazapi_messages",
        ["connection_id", "provider_message_id"],
    )


def downgrade():
    op.drop_index("ix_uazapi_provider_message", table_name="uazapi_messages")
    op.drop_column("uazapi_messages", "provider_message_id")
    op.drop_column("uazapi_messages", "delivery_status")
