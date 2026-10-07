import sqlalchemy as sa
from alembic import op

revision = "20261005_0002"
down_revision = "20260902_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("deactivated_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("credentials_changed_at", sa.DateTime(timezone=True)))
    op.execute("UPDATE users SET credentials_changed_at = created_at WHERE role = 'nutritionist'")
    op.create_table(
        "care_assignments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("nutritionist_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("patient_id <> nutritionist_id", name="ck_assignment_distinct_users"),
    )
    op.create_index("ix_care_assignments_patient_id", "care_assignments", ["patient_id"])
    op.create_index("ix_care_assignments_nutritionist_id", "care_assignments", ["nutritionist_id"])
    op.create_index(
        "uq_assignment_active_patient",
        "care_assignments",
        ["patient_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_invitations_user_id", "invitations", ["user_id"])
    op.create_table(
        "email_outbox",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invitation_id", sa.Uuid(), sa.ForeignKey("invitations.id"), unique=True, nullable=False
        ),
        sa.Column("payload", sa.Text()),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column(
            "available_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("failed_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_outbox_pending",
        "email_outbox",
        ["available_at"],
        postgresql_where=sa.text("payload IS NOT NULL"),
    )


def downgrade():
    op.drop_table("email_outbox")
    op.drop_table("invitations")
    op.drop_table("care_assignments")
    op.drop_column("users", "credentials_changed_at")
    op.drop_column("users", "deactivated_at")
