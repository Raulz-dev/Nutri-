import sqlalchemy as sa
from alembic import op

revision = "20261006_0003"
down_revision = "20261005_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "care_link_invitations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("nutritionist_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("declined_at", sa.DateTime(timezone=True)),
        sa.Column("canceled_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_care_link_invitations_patient_id", "care_link_invitations", ["patient_id"])
    op.create_index(
        "ix_care_link_invitations_nutritionist_id", "care_link_invitations", ["nutritionist_id"]
    )
    op.create_index(
        "uq_care_link_invite_pending_pair",
        "care_link_invitations",
        ["patient_id", "nutritionist_id"],
        unique=True,
        postgresql_where=sa.text(
            "accepted_at IS NULL AND declined_at IS NULL AND canceled_at IS NULL"
        ),
    )


def downgrade():
    op.drop_table("care_link_invitations")
