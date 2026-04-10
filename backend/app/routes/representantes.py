from collections import defaultdict
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app import models, auth as auth_utils, schemas
from app.database import get_db
from app.services import representantes_service
from app.audit import log_audit

router = APIRouter(prefix="/representantes", tags=["representantes"])


@router.get("/ativos")
def get_ativos(current_user: models.User = Depends(auth_utils.get_current_user)):
    """Lista representantes ativos (empresa 8) do parquet fat_representante."""
    return representantes_service.get_representantes_ativos()


@router.get("/parametros", response_model=schemas.ParametrosResponse)
def get_parametros(
    ano: int = Query(default=None, ge=2000, le=2100),
    mes: int = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """
    Retorna parâmetros do BD para o mês/ano informado.
    Cada representante ativo é incluído com seus registros do BD.
    Representantes com registros no BD mas não mais na lista de ativos
    também são incluídos (ex: inativos ou com nome renomeado).
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

    # Representantes ativos (com ou sem registros no BD para o mês)
    seen_reps: set[str] = set()
    representantes = []
    for ativo in ativos:
        fantasia = ativo["fantasia"]
        representantes.append(
            schemas.RepresentanteComParams(
                codigo=ativo["codigo"],
                representante=fantasia,
                parametros=params_by_rep.get(fantasia, []),
                fallback_parquet=None,
            )
        )
        seen_reps.add(fantasia)

    # Representantes presentes no BD mas não mais na lista de ativos
    # (ex: inativos, nome alterado no ERP — garantem que dados históricos apareçam)
    for rep_name, params in params_by_rep.items():
        if rep_name not in seen_reps:
            representantes.append(
                schemas.RepresentanteComParams(
                    codigo=params[0].codigo_representante if params else None,
                    representante=rep_name,
                    parametros=params,
                    fallback_parquet=None,
                )
            )

    return schemas.ParametrosResponse(
        mes=mes_str,
        representantes=representantes,
    )


@router.put("/parametros")
def save_parametros(
    items: list[schemas.ParametroRepresentanteCreate],
    db: Session = Depends(get_db),
    current_user: models.User = auth_utils.require_role("admin", "editor"),
):
    """Salva (upsert) lista de parâmetros no banco. Requer role admin ou editor."""
    data = [i.model_dump() for i in items]
    count = representantes_service.upsert_parametros(db, data)
    registros = [
        {
            "representante": str(item["representante"]).upper(),
            "vigencia": str(item["data_vigencia"])[:7],
            **{k: item[k] for k in ("meta_frete_1", "meta_frete_2", "meta_frete_3",
                                     "margem_parbo", "margem_branco", "margem_integral")
               if item.get(k) is not None},
        }
        for item in data
    ]
    log_audit(db, current_user.id, "PARAM_UPDATE", "success", {
        "updated_by": current_user.username,
        "count": count,
        "registros": registros,
    })
    return {"salvos": count}


@router.delete("/parametros/{param_id}")
def delete_parametro(
    param_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Remove um registro de parâmetro pelo ID.
    - Admin: pode excluir qualquer vigência.
    - Editor: pode excluir apenas vigências a partir da data atual.
    """
    if current_user.role not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    record = db.query(models.ParametroRepresentante).filter_by(id=param_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    if current_user.role == "editor":
        today = date.today()
        vigencia_date = record.data_vigencia if isinstance(record.data_vigencia, date) else date.fromisoformat(str(record.data_vigencia)[:10])
        if vigencia_date < today:
            raise HTTPException(status_code=403, detail="Editor não pode excluir vigências de datas passadas")

    rep_nome = record.representante
    rep_vigencia = str(record.data_vigencia)[:7]
    db.delete(record)
    db.commit()
    log_audit(db, current_user.id, "PARAM_DELETE", "success", {
        "param_id": param_id,
        "representante": rep_nome,
        "vigencia": rep_vigencia,
        "deleted_by": current_user.username,
    })
    return {"deleted": param_id}


@router.post("/importar-parquet")
def importar_parquet(
    ano: int = Query(...),
    mes: int = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = auth_utils.require_role("admin"),
):
    """
    Importa parâmetros do parquet para o BD para o mês/ano especificado.
    Requer role admin.
    """
    response = representantes_service.importar_parquet(db, ano, mes)
    log_audit(
        db,
        current_user.id,
        "IMPORT_PARQUET",
        "success",
        {"ano": ano, "mes": mes, "importados": response.get("importados", 0), "imported_by": current_user.username}
    )
    return response
