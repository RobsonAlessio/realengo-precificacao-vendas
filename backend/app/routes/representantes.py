from collections import defaultdict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app import models, auth as auth_utils, schemas
from app.database import get_db
from app.services import representantes_service

router = APIRouter(prefix="/representantes", tags=["representantes"])


@router.get("/ativos")
def get_ativos(current_user: models.User = Depends(auth_utils.get_current_user)):
    """Lista representantes ativos (empresa 8) do parquet fat_representante."""
    return representantes_service.get_representantes_ativos()


@router.get("/parametros", response_model=schemas.ParametrosResponse)
def get_parametros(
    ano: int = Query(default=None),
    mes: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """
    Retorna parâmetros do BD para o mês/ano informado.
    Cada representante ativo é incluído com seus registros do BD.
    """
    now = datetime.now()
    ano = ano or now.year
    mes = mes or now.month
    mes_str = f"{ano}-{mes:02d}"

    ativos = representantes_service.get_representantes_ativos()
    db_params = representantes_service.get_params_mes(db, ano, mes)

    params_by_rep: dict[str, list] = defaultdict(list)
    for p in db_params:
        params_by_rep[p.representante].append(p)

    return schemas.ParametrosResponse(
        mes=mes_str,
        representantes=[
            schemas.RepresentanteComParams(
                codigo=ativo["codigo"],
                representante=ativo["fantasia"],
                parametros=params_by_rep.get(ativo["fantasia"], []),
                fallback_parquet=None,
            )
            for ativo in ativos
        ],
    )


@router.put("/parametros")
def save_parametros(
    items: list[schemas.ParametroRepresentanteCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Salva (upsert) lista de parâmetros no banco."""
    data = [i.model_dump() for i in items]
    count = representantes_service.upsert_parametros(db, data)
    return {"salvos": count}


@router.delete("/parametros/{param_id}")
def delete_parametro(
    param_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Remove um registro de parâmetro pelo ID."""
    record = db.query(models.ParametroRepresentante).filter_by(id=param_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    db.delete(record)
    db.commit()
    return {"deleted": param_id}
