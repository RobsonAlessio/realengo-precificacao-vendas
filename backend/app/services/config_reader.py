import json
import math
import os
from fastapi import HTTPException

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "../../config/precificacao.json")


def load_config() -> dict:
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Arquivo de configuração não encontrado.")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Erro de sintaxe no JSON de configuração: {e}")


def save_config(data: dict):
    # Preserva as seções _doc e fontes (somente calculos e colunas são editáveis)
    current = load_config()
    current["calculos"] = data.get("calculos", current["calculos"])
    current["colunas"] = data.get("colunas", current["colunas"])
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=2)


def _safe_eval(formula: str, ctx: dict) -> float | None:
    """Avalia fórmula com contexto restrito (sem builtins perigosos)."""
    safe_globals = {
        "__builtins__": {},
        "abs": abs, "round": round, "min": min, "max": max,
        "math": math,
    }
    try:
        result = eval(formula, safe_globals, ctx)  # noqa: S307
        if result is None or (isinstance(result, float) and (math.isnan(result) or math.isinf(result))):
            return None
        return float(result)
    except ZeroDivisionError:
        return None
    except Exception:
        return None


def apply_calculos(rows: list[dict], custo_mp: dict, config: dict) -> list[dict]:
    """Aplica os cálculos ativos de config a cada linha."""
    calculos_ativos = [c for c in config.get("calculos", []) if c.get("ativo", False)]
    if not calculos_ativos:
        return rows

    mp_parbo    = custo_mp.get("empresa_08", {}).get("parbo")
    mp_integral = custo_mp.get("empresa_08", {}).get("integral")
    mp_branco   = custo_mp.get("empresa_58", {}).get("branco")

    def _make_ctx(row: dict, meta_frete_override: float | None = None) -> dict:
        return {
            "meta_frete"         : meta_frete_override if meta_frete_override is not None else (row.get("meta_frete") or 0),
            "margem_parbo"       : row.get("margem_parbo") or 0,
            "margem_branco"      : row.get("margem_branco") or 0,
            "margem_integral"    : row.get("margem_integral") or 0,
            "comissao"           : row.get("comissao") or 0,
            "embalagem"          : row.get("embalagem") or 0,
            "energia"            : row.get("energia") or 0,
            "imposto"            : row.get("imposto") or 0,
            "mp_parbo"           : mp_parbo or 0,
            "mp_branco"          : mp_branco or 0,
            "mp_integral"        : mp_integral or 0,
            "embalagem_parbo"    : row.get("embalagem_parbo") or 0,
            "energia_parbo"      : row.get("energia_parbo") or 0,
            "embalagem_branco"   : row.get("embalagem_branco") or 0,
            "energia_branco"     : row.get("energia_branco") or 0,
            "embalagem_integral" : row.get("embalagem_integral") or 0,
            "energia_integral"   : row.get("energia_integral") or 0,
        }

    result = []
    for row in rows:
        new_row = dict(row)
        ctx_f1 = _make_ctx(row)
        for calc in calculos_ativos:
            new_row[calc["id"]] = round(v, 4) if (v := _safe_eval(calc["formula"], ctx_f1)) is not None else None
        # Variantes F2 / F3 (campos extras usados pelo frontend)
        for suffix, key in (("_f2", "meta_frete_2"), ("_f3", "meta_frete_3")):
            frete_extra = row.get(key)
            if frete_extra is not None:
                ctx_fx = _make_ctx(row, meta_frete_override=float(frete_extra))
                for calc in calculos_ativos:
                    v = _safe_eval(calc["formula"], ctx_fx)
                    new_row[calc["id"] + suffix] = round(v, 4) if v is not None else None
        result.append(new_row)
    return result
