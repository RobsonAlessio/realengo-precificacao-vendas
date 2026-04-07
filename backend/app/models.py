from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, Date, UniqueConstraint, JSON, ForeignKey
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # nullable para usuários LDAP
    is_active = Column(Boolean, default=True)
    role = Column(String(50), nullable=True)  # None = pendente aprovação
    auth_provider = Column(String(20), nullable=False, default="local")  # "local" ou "ldap"
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False)
    event_metadata = Column(JSON, nullable=True)  # renamed from metadata para evitar conflito com SQLAlchemy
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ParametroRepresentante(Base):
    __tablename__ = "parametros_representante"

    id             = Column(Integer, primary_key=True, index=True)
    representante  = Column(String(120), nullable=False, index=True)
    data_vigencia  = Column(Date, nullable=False)
    meta_frete_1   = Column(Numeric(10, 4), nullable=True)
    meta_frete_2   = Column(Numeric(10, 4), nullable=True)
    meta_frete_3   = Column(Numeric(10, 4), nullable=True)
    margem_parbo   = Column(Numeric(8, 6), nullable=True)
    margem_branco  = Column(Numeric(8, 6), nullable=True)
    margem_integral= Column(Numeric(8, 6), nullable=True)
    codigo_representante = Column(Integer, nullable=True)
    criado_em      = Column(DateTime, default=datetime.utcnow)
    atualizado_em  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("representante", "data_vigencia", name="uq_rep_data"),
    )
