import sqlalchemy as sa
from alembic import op

revision = "20261022_0010"
down_revision = "20261011_0009"
branch_labels = None
depends_on = None


def upgrade():
    # Existing accounts keep access and complete their CPF in their own profile.
    op.add_column("users", sa.Column("cpf", sa.String(11), nullable=True))
    op.create_check_constraint("ck_users_cpf_format", "users", "cpf IS NULL OR cpf ~ '^[0-9]{11}$'")
    op.create_index("uq_users_cpf", "users", ["cpf"], unique=True)


def downgrade():
    op.drop_index("uq_users_cpf", table_name="users")
    op.drop_constraint("ck_users_cpf_format", "users", type_="check")
    op.drop_column("users", "cpf")
