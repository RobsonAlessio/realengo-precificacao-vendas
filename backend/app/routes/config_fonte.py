from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import models, auth as auth_utils, schemas
from app.database import get_db

router = APIRouter(prefix="/config", tags=["config-fonte"])


def _get_or_create(db: Session) -> models.ConfigFonteCustos:
    """Retorna o registro único de config, criando se necessário."""
    cfg = db.query(models.ConfigFonteCustos).filter(models.ConfigFonteCustos.id == 1).first()
    if not cfg:
        cfg = models.ConfigFonteCustos(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/fonte-custos", response_model=schemas.FonteCustosResponse)
def get_fonte_custos(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Retorna a configuração global de fonte dos custos."""
    return _get_or_create(db)


@router.put("/fonte-custos", response_model=schemas.FonteCustosResponse)
def update_fonte_custos(
    payload: schemas.FonteCustosUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Atualiza a configuração global de fonte dos custos. Somente admin."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar a fonte dos custos.")
    cfg = _get_or_create(db)
    cfg.fonte_mp = payload.fonte_mp
    cfg.fonte_embalagem = payload.fonte_embalagem
    cfg.fonte_energia = payload.fonte_energia
    cfg.fonte_renda = payload.fonte_renda
    cfg.atualizado_em = datetime.utcnow()
    cfg.atualizado_por = current_user.username
    db.commit()
    db.refresh(cfg)
    return cfg
