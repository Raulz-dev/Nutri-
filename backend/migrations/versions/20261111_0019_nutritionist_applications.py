"""Queue public applications for nutritionist accounts."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0019"
down_revision = "20261111_0018"
branch_labels = None
depends_on = None


def upgrade():
    table = "nutritionist_applications"
    op.create_table(
        table,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("crn", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("decision", sa.String(8)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("reviewer_id", sa.Uuid(), sa.ForeignKey("users.id")),
        sa.CheckConstraint(
            "decision IN ('approved', 'rejected')", name="ck_nutritionist_application_decision"
        ),
    )
    op.create_index(
        "uq_nutritionist_application_open_email",
        table,
        ["email"],
        unique=True,
        postgresql_where=sa.text("decision IS DISTINCT FROM 'rejected'"),
    )
    op.create_index(
        "ix_nutritionist_application_queue",
        table,
        ["created_at", "id"],
        postgresql_where=sa.text("decision IS NULL"),
    )


def downgrade():
    op.drop_table("nutritionist_applications")
