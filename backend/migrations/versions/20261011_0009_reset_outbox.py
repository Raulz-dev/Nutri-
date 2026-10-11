import sqlalchemy as sa
from alembic import op

revision = "20261011_0009"
down_revision = "20261011_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("email_outbox", "invitation_id", nullable=True)
    op.add_column(
        "email_outbox",
        sa.Column(
            "password_reset_id", sa.Uuid(), sa.ForeignKey("password_reset_tokens.id"), unique=True
        ),
    )
    op.create_check_constraint(
        "ck_outbox_one_token",
        "email_outbox",
        "(invitation_id IS NULL) <> (password_reset_id IS NULL)",
    )


def downgrade():
    op.execute("DELETE FROM email_outbox WHERE password_reset_id IS NOT NULL")
    op.drop_constraint("ck_outbox_one_token", "email_outbox", type_="check")
    op.drop_column("email_outbox", "password_reset_id")
    op.alter_column("email_outbox", "invitation_id", nullable=False)
