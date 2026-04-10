from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app import models, auth as auth_utils, schemas
from app.database import get_db

router = APIRouter(prefix="/parametros-gerais", tags=["parametros-gerais"])


def _require_editor(current_user: models.User = Depends(auth_utils.get_current_user)):
    if current_user.role not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    return current_user


@router.get("", response_model=schemas.ParametrosGeraisListResponse)
def list_parametros_gerais(
    ano: int = Query(default=None, ge=2000, le=2100),
    mes: int = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Lista todas as vigências de parâmetros gerais para o mês/ano informado."""
    now = datetime.now()
    ano = ano or now.year
    mes = mes or now.month
    mes_str = f"{ano}-{mes:02d}"

    inicio = date(ano, mes, 1)
    # último dia do mês
    import calendar
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    fim = date(ano, mes, ultimo_dia)

    vigencias = (
        db.query(models.ParametroGeral)
        .filter(
            models.ParametroGeral.data_vigencia >= inicio,
            models.ParametroGeral.data_vigencia <= fim,
        )
        .order_by(models.ParametroGeral.data_vigencia)
        .all()
    )
    return schemas.ParametrosGeraisListResponse(mes=mes_str, vigencias=vigencias)


@router.put("")
def upsert_parametros_gerais(
    items: list[schemas.ParametroGeralCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_editor),
):
    """Upsert de vigências de parâmetros gerais."""
    hoje = date.today()
    salvos = 0
    for item in items:
        if current_user.role == "editor" and item.data_vigencia < hoje:
            raise HTTPException(
                status_code=403,
                detail=f"Editor não pode editar vigência passada ({item.data_vigencia}).",
            )
        stmt = pg_insert(models.ParametroGeral).values(
            data_vigencia=item.data_vigencia,
            mp_parbo_saco=item.mp_parbo_saco,
            mp_branco_saco=item.mp_branco_saco,
            embalagem_parbo=item.embalagem_parbo,
            embalagem_branco=item.embalagem_branco,
            energia_parbo=item.energia_parbo,
            energia_branco=item.energia_branco,
            renda_parbo=item.renda_parbo,
            renda_branco=item.renda_branco,
            criado_em=datetime.utcnow(),
            atualizado_em=datetime.utcnow(),
        ).on_conflict_do_update(
            constraint="uq_param_geral_data",
            set_={
                "mp_parbo_saco":    item.mp_parbo_saco,
                "mp_branco_saco":   item.mp_branco_saco,
                "embalagem_parbo":  item.embalagem_parbo,
                "embalagem_branco": item.embalagem_branco,
                "energia_parbo":    item.energia_parbo,
                "energia_branco":   item.energia_branco,
                "renda_parbo":      item.renda_parbo,
                "renda_branco":     item.renda_branco,
                "atualizado_em":    datetime.utcnow(),
            },
        )
        db.execute(stmt)
        salvos += 1
    db.commit()
    return {"salvos": salvos}


@router.delete("/{param_id}")
def delete_parametro_geral(
    param_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_editor),
):
    """Remove uma vigência de parâmetros gerais."""
    registro = db.query(models.ParametroGeral).filter(models.ParametroGeral.id == param_id).first()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro não encontrado.")
    hoje = date.today()
    if current_user.role == "editor" and registro.data_vigencia < hoje:
        raise HTTPException(status_code=403, detail="Editor não pode excluir vigência passada.")
    db.delete(registro)
    db.commit()
    return {"ok": True}
