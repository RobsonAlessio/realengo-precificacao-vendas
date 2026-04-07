import os
import math
import logging
import pandas as pd
from datetime import datetime
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# fat_representante: usado para comissões e lista de ativos
_QLIK_BRONZE = "/mnt/datalake_realengo/bronze"
PARQUET_PATH_REPRESENTANTES = os.getenv(
    "PARQUET_PATH_REPRESENTANTES",
    f"{_QLIK_BRONZE}/extracao_cache/fat_representante/fat_representante.parquet",
)
PARQUET_PATH_CUSTO_MP = os.getenv(
    "PARQUET_CUSTO_MP_PATH",
    f"{_QLIK_BRONZE}/extracao_planilhas/custo_materia_prima/custo_materia_prima.parquet",
)
PARQUET_PATH_META_FRETES = os.getenv(
    "PARQUET_PATH_META_FRETES",
    f"{_QLIK_BRONZE}/extracao_planilhas/meta_fretes/meta_fretes.parquet",
)
PARQUET_PATH_MARGENS_REP = os.getenv(
    "PARQUET_PATH_MARGENS_REP",
    f"{_QLIK_BRONZE}/extracao_planilhas/margens_representante/margens_representante.parquet",
)

# Parquet da camada silver com indicadores de laudo (inclui Renda do Processo)
PARQUET_DIR_INDICADORES_LAUDOS = os.getenv(
    "PARQUET_DIR_INDICADORES_LAUDOS",
    "/mnt/datalake_realengo/silver/indicadores_laudos",
)

# ── Configuração da Renda do Processo ─────────────────────────────────────────
# Filtros equivalentes à regra Qlik:
#   Empresa 8,  Balança 2, Indicador='Renda do Processo'  → PARBO e INTEGRAL
#   Empresa 58, Balança 1, Indicador='Renda do Processo',
#               Indicador Cód.=39                          → BRANCO (exclui cód. 35)
#
# Para alterar filtros: edite as constantes _RENDA_* abaixo.
# Para alterar o desconto aplicado à média: edite _RENDA_AJUSTE.
# Para alterar o fallback (quando parquet não existe): edite _RENDA_FALLBACK.
_RENDA_INDICADOR     = "Renda do Processo"
_RENDA_EMP8_BALANCA  = 2    # Empresa 8 (PARBO/INTEGRAL): balança 2
_RENDA_EMP58_BALANCA = 1    # Empresa 58 (BRANCO): balança 1
_RENDA_EMP58_COD     = 39   # Empresa 58: somente Indicador Cód. 39 (exclui 35)
_RENDA_AJUSTE        = 0.02 # Desconto operacional sobre a média bruta (Avg - 0.02)
# ─────────────────────────────────────────────────────────────────────────────

_KG_SACO = 50
_KG_FARDO = 30


def _safe_float(val):
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def load_fretes() -> pd.DataFrame:
    """
    Carrega meta_fretes.parquet e normaliza colunas de datas para YYYY-MM.
    Retorna DataFrame com colunas [Representante, 'YYYY-MM', 'YYYY-MM', ...]
    Fonte: bronze/extracao_planilhas/meta_fretes/meta_fretes.parquet
    """
    df = pd.read_parquet(PARQUET_PATH_META_FRETES, engine="pyarrow")
    # Renomeia colunas de "YYYY-MM-DD" para "YYYY-MM"
    rename = {col: str(col)[:7] for col in df.columns if col != "Representante"}
    df = df.rename(columns=rename)
    df["Representante"] = df["Representante"].astype(str).str.strip().str.upper()
    return df


def load_margens(mes_str: str) -> pd.DataFrame:
    """
    Carrega margens_representante.parquet para o mês informado (formato YYYY-MM).
    Retorna DataFrame com colunas [Representante, margem_parbo, margem_branco, margem_integral].
    Retorna DataFrame vazio se o mês não estiver disponível no parquet.

    Estrutura do parquet (raw do Excel):
      linha 0: ignorada
      linha 1: datas por grupo (ex: "2026-01-01 00:00:00", None, None, "2026-02-01...", ...)
      linha 2: cabeçalhos (Representante, Parbo, Branco, Integral, Parbo, Branco, Integral, ...)
      linhas 3-N-1: dados dos representantes
      última linha: MÉDIA (excluída)
    """
    df_raw = pd.read_parquet(PARQUET_PATH_MARGENS_REP, engine="pyarrow")
    col_names = list(df_raw.columns)
    date_row = df_raw.iloc[1]

    # Localiza o índice da coluna Parbo correspondente ao mês solicitado
    parbo_col_idx = None
    for idx, col in enumerate(col_names):
        val = date_row[col]
        if val is None or str(val) in ("None", "nan", "NaT"):
            continue
        try:
            if str(val)[:7] == mes_str:
                parbo_col_idx = idx
                break
        except Exception:
            continue

    if parbo_col_idx is None:
        return pd.DataFrame()

    rep_col      = col_names[1]
    parbo_col    = col_names[parbo_col_idx]
    branco_col   = col_names[parbo_col_idx + 1]
    integral_col = col_names[parbo_col_idx + 2]

    # Dados: linha 3 em diante, excluindo a última linha (MÉDIA)
    data_rows = df_raw.iloc[3:-1]

    result = pd.DataFrame({
        "Representante":  data_rows[rep_col].astype(str).str.strip().str.upper(),
        "margem_parbo":   data_rows[parbo_col].apply(_safe_float),
        "margem_branco":  data_rows[branco_col].apply(_safe_float),
        "margem_integral": data_rows[integral_col].apply(_safe_float),
    })

    return result[
        result["Representante"].notna() & (result["Representante"] != "NAN")
    ].reset_index(drop=True)


def get_renda_processo(ano: int, mes: int) -> dict[str, float]:
    """
    Calcula a Renda do Processo média do mês/ano a partir do parquet
    indicadores_laudos, aplicando os mesmos filtros usados no Qlik:

      PARBO/INTEGRAL → Empresa=8,  Balança=_RENDA_EMP8_BALANCA
      BRANCO         → Empresa=58, Balança=_RENDA_EMP58_BALANCA, Cód.=_RENDA_EMP58_COD

    Fórmula final: Avg(Percentual) - _RENDA_AJUSTE  (equivalente ao Qlik)

    ─── Para ajustar filtros ou desconto, edite as constantes _RENDA_* no topo
        deste arquivo (excel_reader.py). ───

    Retorna dict {'parbo': float|None, 'integral': float|None, 'branco': float|None,
    'aviso': str|None} em decimal (ex: 0.7191 = 71,91%).
    Se o parquet do mês não existir, tenta os 2 meses anteriores antes de retornar None.
    """
    # Tenta o mês solicitado e, se não existir, busca até 2 meses anteriores
    caminho = None
    ref_ano, ref_mes = ano, mes
    for delta in range(3):
        a, m = ano, mes - delta
        while m <= 0:
            m += 12
            a -= 1
        candidato = os.path.join(
            PARQUET_DIR_INDICADORES_LAUDOS,
            f"indicadores_laudos_{a:04d}_{m:02d}_01.parquet",
        )
        if os.path.exists(candidato):
            caminho = candidato
            ref_ano, ref_mes = a, m
            break

    if caminho is None:
        return {
            "parbo":    None,
            "integral": None,
            "branco":   None,
            "aviso":    (
                f"Parquet de laudos não encontrado para {ano}-{mes:02d} "
                f"nem nos 2 meses anteriores. Verifique a DAG extract_planilhas."
            ),
        }

    aviso_fallback = None
    if (ref_ano, ref_mes) != (ano, mes):
        aviso_fallback = (
            f"Parquet de laudos de {ano}-{mes:02d} ainda não disponível. "
            f"Usando referência de {ref_ano}-{ref_mes:02d}."
        )

    df = pd.read_parquet(caminho, engine="pyarrow")

    mask_parbo = (
        (df["Empresa"] == 8) &
        (df["Balança"] == _RENDA_EMP8_BALANCA) &
        (df["Indicador"] == _RENDA_INDICADOR)
    )
    mask_branco = (
        (df["Empresa"] == 58) &
        (df["Balança"] == _RENDA_EMP58_BALANCA) &
        (df["Indicador"] == _RENDA_INDICADOR) &
        (df["Indicador Cód."] == _RENDA_EMP58_COD)
    )

    renda_parbo  = float(df[mask_parbo]["Percentual"].mean())  - _RENDA_AJUSTE
    renda_branco = float(df[mask_branco]["Percentual"].mean()) - _RENDA_AJUSTE

    return {
        "parbo":           round(renda_parbo, 6),
        "integral":        round(renda_parbo, 6),  # INTEGRAL usa mesma renda do PARBO (Empresa 8)
        "branco":          round(renda_branco, 6),
        "mes_referencia":  f"{ref_ano}-{ref_mes:02d}",
        "aviso":           aviso_fallback,
    }


def _mp_sc_para_fardo(val_sc: float | None, renda: float | None) -> float | None:
    """Converte custo por saca de 50kg para custo por fardo de 30kg usando a renda informada."""
    if val_sc is None or renda is None:
        return None
    return round(val_sc * _KG_FARDO / (renda * _KG_SACO), 2)


def get_comissoes() -> dict[str, float | None]:
    """
    Retorna dict {fantasia_upper: comissao_decimal} lido de fat_representante.parquet.
    Usado para preencher comissão nas linhas da tabela de preços.
    """
    if not os.path.exists(PARQUET_PATH_REPRESENTANTES):
        return {}

    df = pd.read_parquet(PARQUET_PATH_REPRESENTANTES, engine="pyarrow")
    df8 = df[(df["codEmpresa"] == 8) & (df["situacao"] == "2")].copy()

    if df8.empty:
        return {}

    df8["dataAdmissao"] = pd.to_datetime(df8["dataAdmissao"], errors="coerce")
    df8 = df8.sort_values("dataAdmissao", ascending=False)
    df8 = df8.drop_duplicates(subset="fantasia", keep="first")

    result = {}
    for _, row in df8.iterrows():
        rep = str(row["fantasia"]).strip().upper()
        comissao = _safe_float(row.get("percComissao"))
        result[rep] = round(comissao / 100, 6) if comissao is not None else None
    return result


def get_custo_mp() -> dict:
    """
    Retorna o custo de matéria-prima do dia atual.
    Empresa 08: Parbo e Integral (Valor_08)
    Empresa 58: Branco (Valor_58)
    Se o dia atual não existir, retorna o último valor disponível.

    A Renda do Processo é lida dinamicamente do parquet indicadores_laudos
    do mês atual (camada silver). Para ajustar filtros ou desconto, veja as
    constantes _RENDA_* no topo deste arquivo.
    """
    try:
        if not os.path.exists(PARQUET_PATH_CUSTO_MP):
            logger.error("Parquet de custo MP não encontrado: %s", PARQUET_PATH_CUSTO_MP)
            raise HTTPException(status_code=503, detail="Dados de custo indisponíveis. Contate o administrador.")
        raw = pd.read_parquet(PARQUET_PATH_CUSTO_MP, engine="pyarrow")
        raw.columns = [int(c) for c in raw.columns]

        dados = raw.iloc[4:].copy()
        dados.columns = ["cc_08", "data_08", "valor_08", "_sep", "cc_58", "data_58", "valor_58"]
        dados = dados[dados["data_08"].notna()]

        hoje = datetime.now()
        hoje_str = hoje.strftime("%Y-%m-%d")
        row = dados[dados["data_08"].apply(
            lambda v: (v.strftime("%Y-%m-%d") if isinstance(v, datetime) else str(v)[:10]) == hoje_str
        )]

        if row.empty:
            row = dados.iloc[[-1]]
            data_ref = row.iloc[0]["data_08"]
            referencia = data_ref.strftime("%Y-%m-%d") if isinstance(data_ref, datetime) else str(data_ref)
            aviso = f"Dia atual não encontrado. Usando último valor disponível ({referencia})."
        else:
            referencia = hoje.strftime("%Y-%m-%d")
            aviso = None

        v08 = _safe_float(row.iloc[0]["valor_08"])
        v58 = _safe_float(row.iloc[0]["valor_58"])

        renda = get_renda_processo(hoje.year, hoje.month)

        avisos = [a for a in [aviso, renda.get("aviso")] if a]

        return {
            "data": referencia,
            "renda_processo": {
                "parbo":           renda["parbo"],
                "integral":        renda["integral"],
                "branco":          renda["branco"],
                "mes_referencia":  renda.get("mes_referencia"),
            },
            "empresa_08": {
                "parbo":        _mp_sc_para_fardo(v08, renda["parbo"]),
                "parbo_sc":     round(v08, 2) if v08 is not None else None,
                "integral":     _mp_sc_para_fardo(v08, renda["integral"]),
                "integral_sc":  round(v08, 2) if v08 is not None else None,
            },
            "empresa_58": {
                "branco":       _mp_sc_para_fardo(v58, renda["branco"]),
                "branco_sc":    round(v58, 2) if v58 is not None else None,
            },
            "aviso": " | ".join(avisos) if avisos else None,
        }

    except HTTPException:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erro ao ler custo MP: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao processar dados. Contate o administrador.")
