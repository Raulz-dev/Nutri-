import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20261007_0004"
down_revision = "20261006_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "patient_intake_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("data", JSONB(), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "uq_patient_intake_revision",
        "patient_intake_revisions",
        ["patient_id", "revision"],
        unique=True,
    )
    op.create_table(
        "measurements",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column("measured_on", sa.Date(), nullable=False),
        sa.Column("weight_kg", sa.Numeric(4, 1), nullable=False),
        sa.Column("body_fat_pct", sa.Numeric(4, 1)),
        sa.Column("note", sa.String(2000), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("weight_kg > 0 AND weight_kg <= 500", name="ck_measurements_weight"),
        sa.CheckConstraint(
            "body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 100)",
            name="ck_measurements_fat",
        ),
    )
    op.create_index(
        "ix_measurements_patient_date", "measurements", ["patient_id", "measured_on", "created_at"]
    )
    op.create_table(
        "follow_up_notes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("length(text) BETWEEN 1 AND 4000", name="ck_follow_up_note_length"),
    )
    op.create_index(
        "ix_follow_up_notes_patient_created", "follow_up_notes", ["patient_id", "created_at"]
    )


def downgrade():
    op.drop_table("follow_up_notes")
    op.drop_table("measurements")
    op.drop_table("patient_intake_revisions")
