from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import extract
from app import models, auth as auth_utils
from app.database import get_db
from app.services.excel_reader import get_custo_mp, get_comissoes
from app.services.config_reader import load_config, apply_calculos
from app.services.parquet_reader import get_custo_producao as _get_custo_producao
from app.services import representantes_service

router = APIRouter(prefix="/prices", tags=["prices"])


def _montar_rows_do_bd(db: Session) -> tuple[list[dict], str]:
    """
    Retorna (rows, mes_atual) com os representantes que possuem parâmetros
    vigentes no mês atual. Retorna lista vazia se não houver dados cadastrados.
    Comissão é lida de fat_representante.parquet.
    """
    hoje = date.today()
    comissoes = get_comissoes()
    icms_map  = representantes_service.get_icms_por_representante(hoje.year, hoje.month)

    mes_ref = hoje.strftime("%Y-%m")
    reps_bd = (
        db.query(models.ParametroRepresentante.representante)
        .filter(
            extract("year",  models.ParametroRepresentante.data_vigencia) == hoje.year,
            extract("month", models.ParametroRepresentante.data_vigencia) == hoje.month,
            models.ParametroRepresentante.data_vigencia <= hoje,
        )
        .distinct()
        .all()
    )

    if not reps_bd:
        return [], mes_ref

    result = []
    for (rep_name,) in reps_bd:
        params = (
            db.query(models.ParametroRepresentante)
            .filter(
                models.ParametroRepresentante.representante == rep_name,
                extract("year",  models.ParametroRepresentante.data_vigencia) == hoje.year,
                extract("month", models.ParametroRepresentante.data_vigencia) == hoje.month,
            )
            .order_by(models.ParametroRepresentante.data_vigencia.desc())
            .first()
        )
        if not params or not params.meta_frete_1:
            continue

        row: dict = {
            "representante":        rep_name,
            "meta_frete":           float(params.meta_frete_1),
            "margem_parbo":         float(params.margem_parbo)    if params.margem_parbo    is not None else None,
            "margem_branco":        float(params.margem_branco)   if params.margem_branco   is not None else None,
            "margem_integral":      float(params.margem_integral) if params.margem_integral is not None else None,
            "comissao":             comissoes.get(rep_name),
            "imposto":              icms_map.get(str(params.codigo_representante)),
            "mes":                  mes_ref,
            "codigo_representante": params.codigo_representante,
        }
        if params.meta_frete_2 is not None:
            row["meta_frete_2"] = float(params.meta_frete_2)
        if params.meta_frete_3 is not None:
            row["meta_frete_3"] = float(params.meta_frete_3)

        result.append(row)

    return result, mes_ref


@router.get("/custo-mp")
def custo_mp(current_user: models.User = Depends(auth_utils.get_current_user)):
    return get_custo_mp()


@router.get("/tabela")
def tabela(
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retorna tabela completa de precificação.
    Usa mês atual se houver parâmetros; senão usa o mês mais recente do BD.
    Cálculos ativos conforme config/precificacao.json.
    Resposta: { colunas, calculos_ativos, dados, custo_mp, custo_producao, mes }
    """
    config = load_config()
    rows, mes_ref = _montar_rows_do_bd(db)
    mp = get_custo_mp()
    custo_prod = _get_custo_producao()

    mp08p    = mp.get("empresa_08", {}).get("parbo")
    mp08i    = mp.get("empresa_08", {}).get("integral")
    mp58b    = mp.get("empresa_58", {}).get("branco")
    mp08p_sc = mp.get("empresa_08", {}).get("parbo_sc")
    mp08i_sc = mp.get("empresa_08", {}).get("integral_sc")
    mp58b_sc = mp.get("empresa_58", {}).get("branco_sc")

    pi = custo_prod.get("parbo_integral") or {}
    br = custo_prod.get("branco") or {}
    emb_pi = pi.get("embalagem_por_fardo", 0.0)
    ene_pi = pi.get("energia_por_fardo", 0.0)
    emb_br = br.get("embalagem_por_fardo", 0.0)
    ene_br = br.get("energia_por_fardo", 0.0)

    for row in rows:
        row["mp_parbo"]           = mp08p
        row["mp_parbo_sc"]        = mp08p_sc
        row["mp_branco"]          = mp58b
        row["mp_branco_sc"]       = mp58b_sc
        row["mp_integral"]        = mp08i
        row["mp_integral_sc"]     = mp08i_sc
        row["embalagem_parbo"]    = emb_pi
        row["energia_parbo"]      = ene_pi
        row["embalagem_branco"]   = emb_br
        row["energia_branco"]     = ene_br
        row["embalagem_integral"] = emb_pi
        row["energia_integral"]   = ene_pi

    rows = apply_calculos(rows, mp, config)

    return {
        "colunas"         : config.get("colunas", []),
        "calculos_ativos" : [c for c in config.get("calculos", []) if c.get("ativo", False)],
        "dados"           : rows,
        "custo_mp"        : mp,
        "custo_producao"  : custo_prod,
        "mes"             : mes_ref,
    }


@router.get("/custo-producao")
def custo_producao(current_user: models.User = Depends(auth_utils.get_current_user)):
    return _get_custo_producao()
