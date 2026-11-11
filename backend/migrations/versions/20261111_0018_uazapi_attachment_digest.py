"""Track attachment identity for idempotent WhatsApp sends."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0018"
down_revision = "20261111_0017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("uazapi_messages", sa.Column("attachment_digest", sa.String(64)))


def downgrade():
    op.drop_column("uazapi_messages", "attachment_digest")
