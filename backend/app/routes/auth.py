from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas, auth as auth_utils
from app.audit import log_audit
from app.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
@limiter.limit("10/minute")
def login(request: Request, payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Fluxo de login com suporte a LDAP + fallback local.
    Limitado a 10 tentativas por minuto por IP.

    1. Tenta autenticar no AD
    2. Se sucesso AD:
       a. Cria usuário LDAP se não existe
       b. Retorna 403 se role é None (pendente aprovação)
       c. Gera JWT se role existe
    3. Se falha AD:
       a. Tenta autenticar local (se auth_provider=local)
    """

    # Tenta autenticar no AD primeiro
    ldap_auth = auth_utils.authenticate_ldap(payload.username, payload.password)

    if ldap_auth:
        user = db.query(models.User).filter(models.User.username == payload.username).first()

        if not user:
            user = models.User(
                username=payload.username,
                hashed_password=None,
                auth_provider="ldap",
                is_active=True,
                role=None,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            log_audit(db, user.id, "USER_CREATED_LDAP", "success", {"username": payload.username})

        if user.role is None:
            log_audit(db, user.id, "LOGIN_PENDING_ROLE", "warning", {"username": payload.username})
            raise HTTPException(
                status_code=403,
                detail="Usuário LDAP criado. Aguardando aprovação de acesso por um administrador."
            )

        token = auth_utils.create_access_token({"sub": user.username, "role": user.role})
        log_audit(db, user.id, "LOGIN_SUCCESS", "success", {"username": payload.username, "auth_provider": "ldap"})
        return {"access_token": token, "token_type": "bearer"}

    # Autenticação LDAP falhou — tenta local
    user = db.query(models.User).filter(models.User.username == payload.username).first()

    if not user or user.auth_provider != "local":
        log_audit(db, None, "LOGIN_FAILURE", "error", {"username": payload.username})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha incorretos")

    if not auth_utils.verify_password(payload.password, user.hashed_password or ""):
        log_audit(db, user.id, "LOGIN_FAILURE", "error", {"username": payload.username, "auth_provider": "local"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha incorretos")

    if not user.is_active:
        log_audit(db, user.id, "LOGIN_FAILURE", "warning", {"username": payload.username, "reason": "inactive"})
        raise HTTPException(status_code=403, detail="Usuário inativo")

    token = auth_utils.create_access_token({"sub": user.username, "role": user.role})
    log_audit(db, user.id, "LOGIN_SUCCESS", "success", {"username": payload.username, "auth_provider": "local"})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(auth_utils.get_current_user)):
    return current_user
