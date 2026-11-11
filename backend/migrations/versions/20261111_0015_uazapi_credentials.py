"""Store encrypted UazAPI credentials for each connection."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0015"
down_revision = "20261111_0014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("uazapi_connections", sa.Column("base_url", sa.Text(), nullable=True))
    op.add_column("uazapi_connections", sa.Column("encrypted_token", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("uazapi_connections", "encrypted_token")
    op.drop_column("uazapi_connections", "base_url")
