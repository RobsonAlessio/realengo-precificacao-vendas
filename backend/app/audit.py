from sqlalchemy.orm import Session
from app import models


def log_audit(db: Session, user_id, action: str, status: str, metadata=None):
    """
    Registra um evento de auditoria no banco de dados.
    
    Args:
        db: Sessão SQLAlchemy
        user_id: ID do usuário (pode ser None para eventos pré-login)
        action: Tipo de ação (LOGIN_SUCCESS, CONFIG_UPDATE, etc)
        status: Status do evento (success, error, warning)
        metadata: Dados adicionais em JSON (opcional)
    """
    entry = models.AuditLog(
        user_id=user_id,
        action=action,
        status=status,
        event_metadata=metadata,
    )
    db.add(entry)
    db.commit()
    print(f"[AUDIT] {action} | status={status} | user_id={user_id} | metadata={metadata}")
