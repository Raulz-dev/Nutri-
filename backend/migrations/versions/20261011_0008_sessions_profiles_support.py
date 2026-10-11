import sqlalchemy as sa
from alembic import op

revision = "20261011_0008"
down_revision = "20261010_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("refresh_sessions", sa.Column("family_id", sa.String(64)))
    op.execute(
        "UPDATE refresh_sessions SET family_id = token_hash, "
        "revoked_at = COALESCE(revoked_at, now())"
    )
    op.alter_column("refresh_sessions", "family_id", nullable=False)
    op.create_index("ix_refresh_sessions_family_id", "refresh_sessions", ["family_id"])
    op.add_column(
        "users",
        sa.Column("email_notifications", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "professional_profiles",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("crn", sa.String(80), nullable=False),
        sa.Column("contact", sa.String(200), nullable=False),
        sa.Column("bio", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.execute(
        "INSERT INTO professional_profiles (user_id,name,crn,contact,bio,revision) "
        "SELECT id,name,'','','',1 FROM users WHERE role='nutritionist'"
    )
    op.create_table(
        "support_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("admin_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("nutritionist_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sender_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("length(trim(text)) > 0", name="ck_support_message_nonblank"),
    )
    op.create_index(
        "ix_support_messages_pair_sent",
        "support_messages",
        ["admin_id", "nutritionist_id", "sent_at", "id"],
    )


def downgrade():
    op.drop_table("support_messages")
    op.drop_table("professional_profiles")
    op.drop_column("users", "email_notifications")
    op.drop_index("ix_refresh_sessions_family_id", table_name="refresh_sessions")
    op.drop_column("refresh_sessions", "family_id")
