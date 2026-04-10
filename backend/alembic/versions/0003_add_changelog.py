"""Add changelog_entries table

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "changelog_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("versao", sa.String(length=30), nullable=False),
        sa.Column("data_lancamento", sa.Date(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("titulo", sa.String(length=200), nullable=False),
        sa.Column("descricao", sa.String(), nullable=True),
        sa.Column("criado_em", sa.DateTime(), nullable=True),
        sa.Column("criado_por", sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_changelog_entries_id"), "changelog_entries", ["id"], unique=False)
    op.create_index(op.f("ix_changelog_entries_versao"), "changelog_entries", ["versao"], unique=False)
    op.create_index(op.f("ix_changelog_entries_data_lancamento"), "changelog_entries", ["data_lancamento"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_changelog_entries_data_lancamento"), table_name="changelog_entries")
    op.drop_index(op.f("ix_changelog_entries_versao"), table_name="changelog_entries")
    op.drop_index(op.f("ix_changelog_entries_id"), table_name="changelog_entries")
    op.drop_table("changelog_entries")
