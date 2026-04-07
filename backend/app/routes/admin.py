from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app import models, schemas, auth as auth_utils

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/usuarios")
def list_usuarios(
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Lista todos os usuários (admin only)."""
    users = db.query(models.User).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "auth_provider": u.auth_provider,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.put("/usuarios/{user_id}")
def update_usuario(
    user_id: int,
    role: str = None,
    is_active: bool = None,
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Atualiza role e status de um usuário (admin only)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    if role is not None:
        user.role = role
    if is_active is not None:
        user.is_active = is_active
    
    db.commit()
    db.refresh(user)
    
    from app.audit import log_audit
    log_audit(
        db,
        current_user.id,
        "USER_UPDATED",
        "success",
        {"updated_user_id": user.id, "updated_by": current_user.username, "role": role, "is_active": is_active}
    )
    
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "auth_provider": user.auth_provider,
        "is_active": user.is_active,
    }


@router.post("/usuarios", status_code=201)
def create_local_user(
    payload: schemas.CreateLocalUserRequest,
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Cria um usuário local com senha (admin only)."""
    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Usuário já existe")

    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Senha deve ter no mínimo 6 caracteres")

    new_user = models.User(
        username=payload.username,
        hashed_password=auth_utils.hash_password(payload.password),
        role=payload.role,
        is_active=True,
        auth_provider="local",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    from app.audit import log_audit
    log_audit(
        db,
        current_user.id,
        "USER_CREATED_LOCAL",
        "success",
        {"created_user": new_user.username, "created_by": current_user.username, "role": new_user.role},
    )

    return {
        "id": new_user.id,
        "username": new_user.username,
        "role": new_user.role,
        "auth_provider": new_user.auth_provider,
        "is_active": new_user.is_active,
        "created_at": new_user.created_at.isoformat() if new_user.created_at else None,
    }


@router.put("/usuarios/{user_id}/senha")
def change_user_password(
    user_id: int,
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Altera a senha de um usuário local (admin only). Não aplicável a usuários LDAP."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.auth_provider == "ldap":
        raise HTTPException(status_code=400, detail="Não é possível alterar senha de usuários LDAP")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=422, detail="Senha deve ter no mínimo 6 caracteres")

    user.hashed_password = auth_utils.hash_password(payload.new_password)
    db.commit()

    from app.audit import log_audit
    log_audit(
        db,
        current_user.id,
        "USER_PASSWORD_CHANGED",
        "success",
        {"target_user": user.username, "changed_by": current_user.username},
    )

    return {"detail": "Senha alterada com sucesso"}


@router.get("/audit-logs")
def list_audit_logs(
    limit: int = 10,
    date_from: str = None,
    date_to: str = None,
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Lista logs de auditoria com username (admin only). Filtros: date_from, date_to (YYYY-MM-DD)."""
    from datetime import datetime, timedelta
    query = (
        db.query(models.AuditLog, models.User.username)
        .outerjoin(models.User, models.AuditLog.user_id == models.User.id)
    )
    if date_from:
        query = query.filter(models.AuditLog.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(models.AuditLog.created_at < datetime.fromisoformat(date_to) + timedelta(days=1))
    rows = query.order_by(desc(models.AuditLog.created_at)).limit(limit).all()
    return [
        {
            "id": log.id,
            "username": username,
            "action": log.action,
            "status": log.status,
            "metadata": log.event_metadata,
            "created_at": (log.created_at.isoformat() + "Z") if log.created_at else None,
        }
        for log, username in rows
    ]
