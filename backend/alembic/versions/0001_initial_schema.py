"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-23 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "parametros_representante",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("representante", sa.String(length=120), nullable=False),
        sa.Column("data_vigencia", sa.Date(), nullable=False),
        sa.Column("meta_frete_1", sa.Numeric(10, 4), nullable=True),
        sa.Column("meta_frete_2", sa.Numeric(10, 4), nullable=True),
        sa.Column("meta_frete_3", sa.Numeric(10, 4), nullable=True),
        sa.Column("margem_parbo", sa.Numeric(8, 6), nullable=True),
        sa.Column("margem_branco", sa.Numeric(8, 6), nullable=True),
        sa.Column("margem_integral", sa.Numeric(8, 6), nullable=True),
        sa.Column("codigo_representante", sa.Integer(), nullable=True),
        sa.Column("criado_em", sa.DateTime(), nullable=True),
        sa.Column("atualizado_em", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("representante", "data_vigencia", name="uq_rep_data"),
    )
    op.create_index(
        op.f("ix_parametros_representante_id"),
        "parametros_representante",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_parametros_representante_representante"),
        "parametros_representante",
        ["representante"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_parametros_representante_representante"),
        table_name="parametros_representante",
    )
    op.drop_index(
        op.f("ix_parametros_representante_id"),
        table_name="parametros_representante",
    )
    op.drop_table("parametros_representante")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")
