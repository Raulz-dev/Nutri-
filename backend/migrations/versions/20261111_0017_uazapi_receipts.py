"""Preserve UazAPI receipts that arrive before the send response."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0017"
down_revision = "20261111_0016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "uazapi_receipts",
        sa.Column(
            "connection_id",
            sa.Uuid(),
            sa.ForeignKey("uazapi_connections.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("provider_message_id", sa.String(300), primary_key=True),
        sa.Column("rank", sa.Integer(), nullable=False),
    )


def downgrade():
    op.drop_table("uazapi_receipts")
