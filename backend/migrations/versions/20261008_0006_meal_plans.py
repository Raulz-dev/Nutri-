import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20261008_0006"
down_revision = "20261007_0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "meal_plans",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("start_on", sa.Date(), nullable=False),
        sa.Column("end_on", sa.Date(), nullable=False),
        sa.Column("effective_end_on", sa.Date()),
        sa.Column("water_liters", sa.Numeric(3, 1), nullable=False),
        sa.Column("guidance", sa.Text(), nullable=False),
        sa.Column("meals", JSONB(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("end_on >= start_on", name="ck_meal_plan_period"),
        sa.CheckConstraint("water_liters >= 0 AND water_liters <= 15", name="ck_meal_plan_water"),
        sa.CheckConstraint("revision > 0", name="ck_meal_plan_revision"),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'closed')", name="ck_meal_plan_status"
        ),
    )
    op.create_index("ix_meal_plans_patient_created", "meal_plans", ["patient_id", "created_at"])
    op.create_index(
        "ix_meal_plans_patient_status_period",
        "meal_plans",
        ["patient_id", "status", "start_on", "effective_end_on"],
    )


def downgrade():
    op.drop_table("meal_plans")
