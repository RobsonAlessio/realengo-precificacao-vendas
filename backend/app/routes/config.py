from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, auth as auth_utils
from app.services.config_reader import load_config, save_config
from app.audit import log_audit

router = APIRouter(prefix="/config", tags=["config"])


@router.get("")
def get_config(current_user: models.User = Depends(auth_utils.get_current_user)):
    """Retorna a configuração atual (fontes, cálculos e colunas)."""
    return load_config()


@router.put("")
def put_config(body: dict, current_user: models.User = auth_utils.require_role("admin"), db: Session = Depends(get_db)):
    """
    Salva as seções "calculos" e "colunas" do arquivo de configuração.
    As seções "_doc" e "fontes" são preservadas automaticamente.
    Requer permissão admin.
    """
    save_config(body)
    log_audit(db, current_user.id, "CONFIG_UPDATE", "success", {"updated_by": current_user.username})
    return {"ok": True, "message": "Configuração salva com sucesso."}
