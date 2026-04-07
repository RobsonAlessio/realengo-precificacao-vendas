import os
from datetime import date, datetime
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import extract
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app import models

PARQUET_PATH_REPRESENTANTES = os.getenv(
    "PARQUET_PATH_REPRESENTANTES",
    "/mnt/datalake_realengo/bronze/extracao_cache/fat_representante/fat_representante.parquet",
)

PARQUET_PATH_ICMS_REP = os.getenv(
    "PARQUET_PATH_ICMS_REP",
    "/mnt/datalake_realengo/gold/icms_representante/icms_representante.parquet",
)


def get_icms_por_representante(ano: int | None = None, mes: int | None = None) -> dict[str, float | None]:
    """
    Retorna {codRepresentante: pct_icms} com a média dos 3 meses anteriores ao mês informado.
    Exclui o mês atual do cálculo. Retorna None se não houver histórico.
    """
    if not os.path.exists(PARQUET_PATH_ICMS_REP):
        return {}

    df = pd.read_parquet(PARQUET_PATH_ICMS_REP, engine="pyarrow")
    if df.empty:
        return {}

    if ano is None or mes is None:
        hoje = date.today()
        ano, mes = hoje.year, hoje.month

    # Gerar os 3 meses anteriores ao mês de referência (excluindo o próprio)
    meses_anteriores = []
    for i in range(1, 4):
        m = mes - i
        a = ano
        while m <= 0:
            m += 12
            a -= 1
        meses_anteriores.append((a, m))

    # Filtrar apenas os 3 meses anteriores
    mask = pd.Series(False, index=df.index)
    for a, m in meses_anteriores:
        mask = mask | ((df["ano"] == a) & (df["mes"] == m))
    subset = df[mask]

    if subset.empty:
        return {}

    # Média ponderada: Sum(ValorICMSTotal) / Sum(ValorTotalNF) por representante
    # (mesma lógica do QlikSense — pondera pelo volume de vendas de cada mês)
    agg = (
        subset.groupby("codRepresentante")
        .agg(total_icms=("ValorICMSTotal", "sum"), total_venda=("ValorTotalNF", "sum"))
        .reset_index()
    )
    agg["pct_icms"] = agg["total_icms"] / agg["total_venda"].replace(0, float("nan"))

    return {
        str(row["codRepresentante"]): float(row["pct_icms"]) if pd.notna(row["pct_icms"]) else None
        for _, row in agg.iterrows()
    }


def get_representantes_ativos() -> list[dict]:
    """Lista representantes ativos (empresa 8, situacao != '5') do parquet.
    Retorna lista de dicts com {codigo, fantasia, comissao, imposto}.
    """
    if not os.path.exists(PARQUET_PATH_REPRESENTANTES):
        return []
    df = pd.read_parquet(PARQUET_PATH_REPRESENTANTES, engine="pyarrow")
    df8 = df[(df["codEmpresa"] == 8) & (df["situacao"] != "5")].copy()
    if df8.empty:
        return []
    df8["dataAdmissao"] = pd.to_datetime(df8["dataAdmissao"], errors="coerce")
    df8 = df8.sort_values("dataAdmissao", ascending=False)
    df8 = df8.drop_duplicates(subset="fantasia", keep="first")
    df8 = df8[df8["fantasia"].notna()].copy()
    df8["fantasia"] = df8["fantasia"].str.strip().str.upper()
    df8 = df8.sort_values("codRepresent")

    from app.services.excel_reader import get_comissoes
    comissoes = get_comissoes()
    icms_map = get_icms_por_representante()

    result = []
    for _, row in df8.iterrows():
        codigo = row.get("codRepresent")
        fantasia = row["fantasia"]
        cod_int = int(codigo) if codigo is not None and not (isinstance(codigo, float) and str(codigo) == "nan") else None
        result.append({
            "codigo":   cod_int,
            "fantasia": fantasia,
            "comissao": comissoes.get(fantasia),
            "imposto":  icms_map.get(str(cod_int)) if cod_int is not None else None,
        })
    return result


def _codigo_por_fantasia() -> dict[str, int | None]:
    """Retorna mapa {fantasia: codigo} dos representantes ativos."""
    ativos = get_representantes_ativos()
    return {a["fantasia"]: a["codigo"] for a in ativos}


def get_params_mes(db: Session, ano: int, mes: int) -> list[models.ParametroRepresentante]:
    """Retorna todos os parâmetros do banco para o mês/ano informados."""
    return (
        db.query(models.ParametroRepresentante)
        .filter(
            extract("year", models.ParametroRepresentante.data_vigencia) == ano,
            extract("month", models.ParametroRepresentante.data_vigencia) == mes,
        )
        .order_by(
            models.ParametroRepresentante.representante,
            models.ParametroRepresentante.data_vigencia,
        )
        .all()
    )


def get_params_vigentes(db: Session, representante: str, data: date) -> models.ParametroRepresentante | None:
    """
    Retorna o registro mais recente com data_vigencia <= data para o representante.
    Usado pelo prices.py para lookup no cálculo (BD com fallback para parquet).
    """
    return (
        db.query(models.ParametroRepresentante)
        .filter(
            models.ParametroRepresentante.representante == representante.upper(),
            models.ParametroRepresentante.data_vigencia <= data,
        )
        .order_by(models.ParametroRepresentante.data_vigencia.desc())
        .first()
    )


def upsert_parametros(db: Session, items: list[dict]) -> int:
    """Salva (upsert) lista de parâmetros. Retorna quantidade de registros salvos."""
    codigos = _codigo_por_fantasia()
    count = 0
    for item in items:
        rep = str(item["representante"]).upper()
        codigo = item.get("codigo_representante") or codigos.get(rep)
        stmt = pg_insert(models.ParametroRepresentante).values(
            representante=rep,
            data_vigencia=item["data_vigencia"],
            meta_frete_1=item.get("meta_frete_1"),
            meta_frete_2=item.get("meta_frete_2"),
            meta_frete_3=item.get("meta_frete_3"),
            margem_parbo=item.get("margem_parbo"),
            margem_branco=item.get("margem_branco"),
            margem_integral=item.get("margem_integral"),
            codigo_representante=codigo,
            criado_em=datetime.utcnow(),
            atualizado_em=datetime.utcnow(),
        ).on_conflict_do_update(
            constraint="uq_rep_data",
            set_={
                "meta_frete_1": item.get("meta_frete_1"),
                "meta_frete_2": item.get("meta_frete_2"),
                "meta_frete_3": item.get("meta_frete_3"),
                "margem_parbo": item.get("margem_parbo"),
                "margem_branco": item.get("margem_branco"),
                "margem_integral": item.get("margem_integral"),
                "codigo_representante": codigo,
                "atualizado_em": datetime.utcnow(),
            },
        )
        db.execute(stmt)
        count += 1
    db.commit()
    return count


def importar_todos_os_meses(db: Session) -> dict:
    """
    Importa TODOS os meses disponíveis do parquet meta_fretes para o BD.
    Chamado no startup apenas se a tabela estiver vazia.
    """
    from app.services.excel_reader import load_fretes, _safe_float

    try:
        df_fretes = load_fretes()
    except Exception as e:
        return {"importados": 0, "pulados": 0, "erros": [f"Erro ao carregar parquet de fretes: {e}"]}

    date_cols = [c for c in df_fretes.columns if c != "Representante"]
    total_importados = 0
    total_pulados = 0
    all_erros: list[str] = []

    for mes_str in date_cols:
        try:
            ano, mes_num = int(mes_str[:4]), int(mes_str[5:7])
        except ValueError:
            continue
        result = importar_do_parquet(db, ano, mes_num)
        total_importados += result["importados"]
        total_pulados += result["pulados"]
        all_erros.extend(result["erros"])

    return {"importados": total_importados, "pulados": total_pulados, "erros": all_erros}


def importar_do_parquet(db: Session, ano: int, mes: int) -> dict:
    """
    Importa dados dos parquets de fretes e margens para o BD.
    data_vigencia = dia 1 do mês informado.
    """
    from app.services.excel_reader import load_fretes, load_margens, _safe_float

    data_vigencia = date(ano, mes, 1)
    mes_str = f"{ano}-{mes:02d}"
    importados = 0
    pulados = 0
    erros: list[str] = []

    try:
        df_fretes = load_fretes()
    except Exception as e:
        return {"importados": 0, "pulados": 0, "erros": [f"Erro ao carregar parquet de fretes: {e}"]}

    if mes_str not in df_fretes.columns:
        return {"importados": 0, "pulados": 0, "erros": [f"Mês {mes_str} não encontrado no parquet de fretes."]}

    df_margens = None
    try:
        df_margens = load_margens(mes_str)
    except Exception as e:
        erros.append(f"Margens não disponíveis para {mes_str}: {e}")

    codigos = _codigo_por_fantasia()

    for _, row_f in df_fretes.iterrows():
        representante = str(row_f["Representante"]).strip().upper()
        meta_frete_1 = _safe_float(row_f.get(mes_str))
        if meta_frete_1 is None or meta_frete_1 <= 0:
            pulados += 1
            continue

        margem_parbo = margem_branco = margem_integral = None
        if df_margens is not None:
            m = df_margens[df_margens["Representante"] == representante]
            if not m.empty:
                margem_parbo = _safe_float(m.iloc[0].get("margem_parbo"))
                margem_branco = _safe_float(m.iloc[0].get("margem_branco"))
                margem_integral = _safe_float(m.iloc[0].get("margem_integral"))

        codigo = codigos.get(representante)

        stmt = pg_insert(models.ParametroRepresentante).values(
            representante=representante,
            data_vigencia=data_vigencia,
            meta_frete_1=meta_frete_1,
            meta_frete_2=None,
            meta_frete_3=None,
            margem_parbo=margem_parbo,
            margem_branco=margem_branco,
            margem_integral=margem_integral,
            codigo_representante=codigo,
            criado_em=datetime.utcnow(),
            atualizado_em=datetime.utcnow(),
        ).on_conflict_do_update(
            constraint="uq_rep_data",
            set_={
                "meta_frete_1": meta_frete_1,
                "margem_parbo": margem_parbo,
                "margem_branco": margem_branco,
                "margem_integral": margem_integral,
                "codigo_representante": codigo,
                "atualizado_em": datetime.utcnow(),
            },
        )
        db.execute(stmt)
        importados += 1

    db.commit()
    return {"importados": importados, "pulados": pulados, "erros": erros}
