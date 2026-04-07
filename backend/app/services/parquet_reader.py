"""
Serviço para leitura de arquivos Parquet do DataLake silver.
Usado para acessar índices calculados pelo Airflow (transform_cache).
"""

import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

SILVER_INDICE_ATUAL = "/mnt/datalake_realengo/gold/custo_producao/indice_atual.parquet"


def get_custo_producao() -> dict:
    """
    Lê o índice atual de custo de embalagem e energia por fardo.
    Fonte: silver/custo_producao/indice_atual.parquet
           (gerado pela DAG transform_cache, task custos_producao.custo_embalagem_energia)

    Retorna:
    {
      "parbo_integral": {
        "embalagem_por_fardo": float,
        "energia_por_fardo":   float,
        "periodo_referencia":  str,   // ex: "2025-11 a 2026-01"
        "meses_usados":        int
      },
      "branco": { ... },
      "aviso": null | str
    }
    """
    path = Path(SILVER_INDICE_ATUAL)

    if not path.exists():
        logger.warning(
            "indice_atual.parquet não encontrado em '%s'. "
            "Execute a DAG transform_cache no Airflow para gerar.",
            path,
        )
        return {
            "parbo_integral": None,
            "branco": None,
            "aviso": (
                "Índice de custo não disponível. "
                "Execute a DAG transform_cache no Airflow (grupo custos_producao)."
            ),
        }

    try:
        df = pd.read_parquet(path)
    except Exception as exc:
        logger.error("Erro ao ler indice_atual.parquet: %s", exc)
        return {
            "parbo_integral": None,
            "branco": None,
            "aviso": f"Erro ao ler índice de custo: {exc}",
        }

    resultado = {"parbo_integral": None, "branco": None, "aviso": None}

    for _, row in df.iterrows():
        tipo = row.get("Tipo", "")
        dados = {
            "embalagem_por_fardo": round(float(row["EmbalagPorFardo"]), 4),
            "energia_por_fardo":   round(float(row["EnergiaPorFardo"]), 4),
            "periodo_referencia":  str(row["PeriodoReferencia"]),
            "meses_usados":        int(row["MesesUsados"]),
        }
        if tipo == "PARBO_INTEGRAL":
            resultado["parbo_integral"] = dados
        elif tipo == "BRANCO":
            resultado["branco"] = dados

    if resultado["parbo_integral"] is None and resultado["branco"] is None:
        resultado["aviso"] = "Arquivo encontrado mas sem dados válidos."

    return resultado
