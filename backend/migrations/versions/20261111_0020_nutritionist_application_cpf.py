"""Store the CPF submitted with nutritionist applications."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0020"
down_revision = "20261111_0019"
branch_labels = None
depends_on = None


def upgrade():
    table = "nutritionist_applications"
    op.add_column(table, sa.Column("cpf", sa.String(11)))
    op.create_check_constraint(
        "ck_nutritionist_application_cpf", table, "cpf IS NULL OR cpf ~ '^[0-9]{11}$'"
    )


def downgrade():
    op.drop_constraint(
        "ck_nutritionist_application_cpf", "nutritionist_applications", type_="check"
    )
    op.drop_column("nutritionist_applications", "cpf")
