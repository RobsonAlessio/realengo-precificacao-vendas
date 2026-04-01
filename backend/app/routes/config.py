from fastapi import APIRouter, Depends
from app import models, auth as auth_utils
from app.services.config_reader import load_config, save_config

router = APIRouter(prefix="/config", tags=["config"])


@router.get("")
def get_config(current_user: models.User = Depends(auth_utils.get_current_user)):
    """Retorna a configuração atual (fontes, cálculos e colunas)."""
    return load_config()


@router.put("")
def put_config(body: dict, current_user: models.User = Depends(auth_utils.get_current_user)):
    """
    Salva as seções 'calculos' e 'colunas' do arquivo de configuração.
    As seções '_doc' e 'fontes' são preservadas automaticamente.
    """
    save_config(body)
    return {"ok": True, "message": "Configuração salva com sucesso."}
