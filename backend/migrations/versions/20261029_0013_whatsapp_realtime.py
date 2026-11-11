"""One-use socket tickets and transactional conversation notifications."""

import sqlalchemy as sa
from alembic import op

revision = "20261029_0013"
down_revision = "20261028_0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "whatsapp_socket_tickets",
        sa.Column("ticket_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_family", sa.String(64), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_whatsapp_socket_tickets_expiry", "whatsapp_socket_tickets", ["expires_at"])
    op.execute("""
        CREATE FUNCTION whatsapp_conversation_changed() RETURNS trigger
        LANGUAGE plpgsql AS $$
        DECLARE contact uuid; owner_id uuid;
        BEGIN
            IF TG_TABLE_NAME = 'whatsapp_messages' THEN
                contact := NEW.contact_id;
            ELSIF TG_TABLE_NAME = 'whatsapp_contacts' THEN
                contact := NEW.id;
            ELSIF TG_TABLE_NAME = 'care_assignments' THEN
                SELECT id INTO contact FROM whatsapp_contacts WHERE assignment_id = NEW.id;
            ELSE
                owner_id := NEW.nutritionist_id;
            END IF;
            IF contact IS NOT NULL THEN
                SELECT c.nutritionist_id INTO owner_id FROM whatsapp_connections c
                JOIN whatsapp_contacts p ON p.connection_id = c.id WHERE p.id = contact;
            END IF;
            IF owner_id IS NOT NULL THEN
                PERFORM pg_notify('nutri_whatsapp_changes', json_build_object(
                    'nutritionist_id', owner_id, 'contact_id', contact)::text);
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    for table, columns in (
        ("whatsapp_messages", "status, read_at"),
        ("whatsapp_contacts", "last_inbound_at"),
        ("care_assignments", "ended_at"),
        ("whatsapp_connections", "active"),
    ):
        # All values here are migration constants, never application input.
        op.execute(f"""CREATE TRIGGER {table}_realtime AFTER INSERT OR UPDATE OF {columns}
                       ON {table} FOR EACH ROW EXECUTE FUNCTION whatsapp_conversation_changed()""")


def downgrade():
    for table in (
        "whatsapp_messages",
        "whatsapp_contacts",
        "care_assignments",
        "whatsapp_connections",
    ):
        op.execute(f"DROP TRIGGER {table}_realtime ON {table}")
    op.execute("DROP FUNCTION whatsapp_conversation_changed()")
    op.drop_table("whatsapp_socket_tickets")
