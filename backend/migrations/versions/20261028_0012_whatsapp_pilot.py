"""Separate WhatsApp pilot storage; internal chat is unchanged."""

import sqlalchemy as sa
from alembic import op

revision = "20261028_0012"
down_revision = "20261022_0011"
branch_labels = None
depends_on = None


def common():
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def upgrade():
    op.create_table(
        "whatsapp_connections",
        *common(),
        sa.Column(
            "nutritionist_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, unique=True
        ),
        sa.Column("phone_number_id", sa.String(100), nullable=False, unique=True),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "whatsapp_contacts",
        *common(),
        sa.Column(
            "connection_id", sa.Uuid(), sa.ForeignKey("whatsapp_connections.id"), nullable=False
        ),
        sa.Column(
            "assignment_id",
            sa.Uuid(),
            sa.ForeignKey("care_assignments.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.Column("last_inbound_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("connection_id", "phone", name="uq_whatsapp_contact_phone"),
    )
    op.create_table(
        "whatsapp_messages",
        *common(),
        sa.Column("contact_id", sa.Uuid(), sa.ForeignKey("whatsapp_contacts.id"), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("external_id", sa.String(300), unique=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(80)),
        sa.CheckConstraint("direction IN ('inbound', 'outbound')", name="ck_whatsapp_direction"),
        sa.CheckConstraint(
            "status IN ('received','queued','sending','unknown',"
            "'sent','delivered','read','failed')",
            name="ck_whatsapp_status",
        ),
        sa.CheckConstraint("length(trim(text)) > 0", name="ck_whatsapp_text"),
    )
    op.create_index(
        "ix_whatsapp_messages_history", "whatsapp_messages", ["contact_id", "occurred_at", "id"]
    )
    op.create_index("ix_whatsapp_messages_pending", "whatsapp_messages", ["status", "created_at"])
    op.create_table(
        "whatsapp_events",
        *common(),
        sa.Column(
            "connection_id", sa.Uuid(), sa.ForeignKey("whatsapp_connections.id"), nullable=False
        ),
        sa.Column("event_key", sa.String(64), nullable=False, unique=True),
        sa.Column("payload", sa.Text()),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_whatsapp_events_pending", "whatsapp_events", ["processed_at", "created_at"])


def downgrade():
    op.drop_table("whatsapp_events")
    op.drop_table("whatsapp_messages")
    op.drop_table("whatsapp_contacts")
    op.drop_table("whatsapp_connections")
