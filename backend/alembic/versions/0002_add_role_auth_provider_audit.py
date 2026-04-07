"""Add role, auth_provider and audit_logs table

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-06 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adicionar coluna role a users
    op.add_column("users", sa.Column("role", sa.String(length=50), nullable=True))
    
    # Adicionar coluna auth_provider a users
    op.add_column("users", sa.Column("auth_provider", sa.String(length=20), nullable=False, server_default="local"))
    
    # Tornar hashed_password nullable para suportar usuários LDAP
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(),
        nullable=True,
    )
    
    # Criar tabela audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("event_metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_id"), "audit_logs", ["id"], unique=False)
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False)


def downgrade() -> None:
    # Remover índices de audit_logs
    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_id"), table_name="audit_logs")
    
    # Remover tabela audit_logs
    op.drop_table("audit_logs")
    
    # Restaurar hashed_password como NOT NULL
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(),
        nullable=False,
    )
    
    # Remover colunas de users
    op.drop_column("users", "auth_provider")
    op.drop_column("users", "role")
