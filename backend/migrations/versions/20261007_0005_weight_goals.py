import sqlalchemy as sa
from alembic import op

revision = "20261007_0005"
down_revision = "20261007_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "weight_goal_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("target_kg", sa.Numeric(4, 1), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("target_kg > 0 AND target_kg <= 500", name="ck_weight_goal_target"),
    )
    op.create_index(
        "uq_weight_goal_revision", "weight_goal_revisions", ["patient_id", "revision"], unique=True
    )


def downgrade():
    op.drop_table("weight_goal_revisions")
