"""Add parametros_gerais table

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "parametros_gerais",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("data_vigencia", sa.Date(), nullable=False),
        sa.Column("mp_parbo_saco",    sa.Numeric(10, 4), nullable=True),
        sa.Column("mp_branco_saco",   sa.Numeric(10, 4), nullable=True),
        sa.Column("embalagem_parbo",  sa.Numeric(10, 4), nullable=True),
        sa.Column("embalagem_branco", sa.Numeric(10, 4), nullable=True),
        sa.Column("energia_parbo",    sa.Numeric(10, 4), nullable=True),
        sa.Column("energia_branco",   sa.Numeric(10, 4), nullable=True),
        sa.Column("renda_parbo",      sa.Numeric(8, 6),  nullable=True),
        sa.Column("renda_branco",     sa.Numeric(8, 6),  nullable=True),
        sa.Column("criado_em",    sa.DateTime(), nullable=True),
        sa.Column("atualizado_em", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("data_vigencia", name="uq_param_geral_data"),
    )
    op.create_index(op.f("ix_parametros_gerais_id"), "parametros_gerais", ["id"], unique=False)
    op.create_index(op.f("ix_parametros_gerais_data_vigencia"), "parametros_gerais", ["data_vigencia"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_parametros_gerais_data_vigencia"), table_name="parametros_gerais")
    op.drop_index(op.f("ix_parametros_gerais_id"), table_name="parametros_gerais")
    op.drop_table("parametros_gerais")
