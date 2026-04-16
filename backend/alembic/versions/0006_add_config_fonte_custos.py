"""Add config_fonte_custos table

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-16

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    table = op.create_table(
        "config_fonte_custos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fonte_mp", sa.String(length=20), nullable=False, server_default="realizado"),
        sa.Column("fonte_embalagem", sa.String(length=20), nullable=False, server_default="realizado"),
        sa.Column("fonte_energia", sa.String(length=20), nullable=False, server_default="realizado"),
        sa.Column("fonte_renda", sa.String(length=20), nullable=False, server_default="realizado"),
        sa.Column("atualizado_em", sa.DateTime(), nullable=True),
        sa.Column("atualizado_por", sa.String(length=100), nullable=True),
    )
    # Insere registro default (single-row)
    op.execute(
        "INSERT INTO config_fonte_custos (id, fonte_mp, fonte_embalagem, fonte_energia, fonte_renda) "
        "VALUES (1, 'realizado', 'realizado', 'realizado', 'realizado')"
    )


def downgrade() -> None:
    op.drop_table("config_fonte_custos")
