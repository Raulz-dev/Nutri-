"""Store UazAPI conversations and media metadata per user."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0014"
down_revision = "20261029_0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "uazapi_connections",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("instance_id", sa.String(length=200), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("instance_id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "uazapi_conversations",
        sa.Column("connection_id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(length=300), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["connection_id"],
            ["uazapi_connections.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("connection_id", "external_id", name="uq_uazapi_conversation_external"),
        sa.UniqueConstraint("connection_id", "id", name="uq_uazapi_conversation_scope"),
    )
    op.create_table(
        "uazapi_senders",
        sa.Column("connection_id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(length=300), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("assignment_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["assignment_id"], ["care_assignments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["connection_id"],
            ["uazapi_connections.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("connection_id", "external_id", name="uq_uazapi_sender_external"),
        sa.UniqueConstraint("connection_id", "id", name="uq_uazapi_sender_scope"),
    )
    op.create_index(
        op.f("ix_uazapi_senders_assignment_id"), "uazapi_senders", ["assignment_id"], unique=False
    )
    op.create_table(
        "uazapi_messages",
        sa.Column("connection_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(length=300), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "direction IN ('inbound', 'outbound')", name="ck_uazapi_message_direction"
        ),
        sa.ForeignKeyConstraint(
            ["connection_id", "conversation_id"],
            ["uazapi_conversations.connection_id", "uazapi_conversations.id"],
            name="fk_uazapi_message_conversation",
        ),
        sa.ForeignKeyConstraint(
            ["connection_id", "sender_id"],
            ["uazapi_senders.connection_id", "uazapi_senders.id"],
            name="fk_uazapi_message_sender",
        ),
        sa.ForeignKeyConstraint(
            ["connection_id"],
            ["uazapi_connections.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("connection_id", "external_id", name="uq_uazapi_message_external"),
    )
    op.create_index(
        "ix_uazapi_message_history",
        "uazapi_messages",
        ["connection_id", "conversation_id", "occurred_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_uazapi_message_sender", "uazapi_messages", ["connection_id", "sender_id"], unique=False
    )
    op.create_table(
        "uazapi_attachments",
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("storage_key", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("size_bytes >= 0", name="ck_uazapi_attachment_size"),
        sa.ForeignKeyConstraint(["message_id"], ["uazapi_messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_uazapi_attachments_message_id"), "uazapi_attachments", ["message_id"], unique=False
    )


def downgrade():
    op.drop_table("uazapi_attachments")
    op.drop_table("uazapi_messages")
    op.drop_table("uazapi_senders")
    op.drop_table("uazapi_conversations")
    op.drop_table("uazapi_connections")
