import sqlalchemy as sa
from alembic import op

revision = "20261010_0007"
down_revision = "20261008_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "appointments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("nutritionist_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("appointment_on", sa.Date(), nullable=False),
        sa.Column("appointment_at", sa.Time(), nullable=False),
        sa.Column("format", sa.String(20), nullable=False),
        sa.Column("location", sa.String(500), nullable=False),
        sa.Column("guidance", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("format IN ('Presencial', 'Online')", name="ck_appointment_format"),
        sa.CheckConstraint(
            "status IN ('scheduled', 'completed', 'cancelled')", name="ck_appointment_status"
        ),
        sa.CheckConstraint("revision > 0", name="ck_appointment_revision"),
    )
    op.create_index(
        "ix_appointments_patient_date",
        "appointments",
        ["patient_id", "appointment_on", "appointment_at"],
    )
    op.create_index(
        "ix_appointments_nutritionist_date",
        "appointments",
        ["nutritionist_id", "appointment_on", "appointment_at"],
    )
    op.create_index(
        "uq_appointment_patient_slot",
        "appointments",
        ["patient_id", "appointment_on", "appointment_at"],
        unique=True,
        postgresql_where=sa.text("status = 'scheduled'"),
    )
    op.create_index(
        "uq_appointment_nutritionist_slot",
        "appointments",
        ["nutritionist_id", "appointment_on", "appointment_at"],
        unique=True,
        postgresql_where=sa.text("status = 'scheduled'"),
    )
    op.create_table(
        "care_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("assignment_id", sa.Uuid(), sa.ForeignKey("care_assignments.id"), nullable=False),
        sa.Column("sender_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("length(trim(text)) > 0", name="ck_care_message_nonblank"),
    )
    op.create_index(
        "ix_care_messages_assignment_sent", "care_messages", ["assignment_id", "sent_at", "id"]
    )


def downgrade():
    op.drop_table("care_messages")
    op.drop_table("appointments")
