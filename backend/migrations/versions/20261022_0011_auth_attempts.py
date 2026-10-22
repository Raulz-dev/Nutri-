import sqlalchemy as sa
from alembic import op

revision = "20261022_0011"
down_revision = "20261022_0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "auth_attempts",
        sa.Column("bucket_key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("attempts >= 0", name="ck_auth_attempts_nonnegative"),
    )
    op.create_index("ix_auth_attempts_expires_at", "auth_attempts", ["expires_at"])


def downgrade():
    op.drop_table("auth_attempts")
