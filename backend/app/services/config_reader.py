import json
import math
import os
from fastapi import HTTPException
from simpleeval import simple_eval, EvalWithCompoundTypes

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
    current = load_config()
    current["calculos"] = data.get("calculos", current["calculos"])
    current["colunas"] = data.get("colunas", current["colunas"])
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=2)


def _safe_eval(formula: str, ctx: dict) -> float | None:
    try:
        result = simple_eval(
            formula,
            names=ctx,
            functions={"abs": abs, "round": round, "min": min, "max": max},
        )
        if result is None or (isinstance(result, float) and (math.isnan(result) or math.isinf(result))):
            return None
        return float(result)
    except ZeroDivisionError:
        return None
    except Exception:
        return None


def _calc_comissao_frete(p1: float, frete_embutido: float, comissao: float) -> float:
    """
    Calcula a comissão sobre frete líquido (Passo 4 do novo cálculo).
    P2 = P1 - frete_embutido
    P3 = P2 / (1 - comissao)
    P4 = P3 - P2 = P2 * comissao / (1 - comissao)
    """
    if comissao >= 1 or comissao < 0:
        return 0
    p2 = p1 - frete_embutido
    return p2 * comissao / (1 - comissao) if (1 - comissao) > 0 else 0


def apply_calculos(rows: list[dict], custo_mp: dict, config: dict) -> list[dict]:
    calculos_ativos = [c for c in config.get("calculos", []) if c.get("ativo", False)]
    if not calculos_ativos:
        return rows

    mp_parbo    = custo_mp.get("empresa_08", {}).get("parbo")
    mp_integral = custo_mp.get("empresa_08", {}).get("integral")
    mp_branco   = custo_mp.get("empresa_58", {}).get("branco")

    def _make_ctx(row: dict, meta_frete_override: float | None = None) -> dict:
        frete = meta_frete_override if meta_frete_override is not None else (row.get("meta_frete") or 0)
        comissao = row.get("comissao") or 0
        margem_parbo    = row.get("margem_parbo") or 0
        margem_branco   = row.get("margem_branco") or 0
        margem_integral = row.get("margem_integral") or 0
        imposto = row.get("imposto") or 0

        emb_parbo    = row.get("embalagem_parbo") or 0
        ene_parbo    = row.get("energia_parbo") or 0
        emb_branco   = row.get("embalagem_branco") or 0
        ene_branco   = row.get("energia_branco") or 0
        emb_integral = row.get("embalagem_integral") or 0
        ene_integral = row.get("energia_integral") or 0

        frete_embutido_parbo    = row.get("frete_embutido_parbo") or 0
        frete_embutido_branco   = row.get("frete_embutido_branco") or 0
        frete_embutido_integral = row.get("frete_embutido_integral") or 0

        p1_parbo = (mp_parbo + frete + emb_parbo + ene_parbo) / (1 - margem_parbo - imposto) \
            if (1 - margem_parbo - imposto) > 0 else 0
        p1_branco = (mp_branco + frete + emb_branco + ene_branco) / (1 - margem_branco - imposto) \
            if (1 - margem_branco - imposto) > 0 else 0
        p1_integral = (mp_integral + frete + emb_integral + ene_integral) / (1 - margem_integral - imposto) \
            if (1 - margem_integral - imposto) > 0 else 0

        comissao_frete_parbo    = _calc_comissao_frete(p1_parbo, frete_embutido_parbo, comissao)
        comissao_frete_branco   = _calc_comissao_frete(p1_branco, frete_embutido_branco, comissao)
        comissao_frete_integral = _calc_comissao_frete(p1_integral, frete_embutido_integral, comissao)

        return {
            "meta_frete":             frete,
            "margem_parbo":           margem_parbo,
            "margem_branco":          margem_branco,
            "margem_integral":        margem_integral,
            "comissao":               comissao,
            "embalagem":              row.get("embalagem") or 0,
            "energia":                row.get("energia") or 0,
            "imposto":                imposto,
            "mp_parbo":               mp_parbo or 0,
            "mp_branco":              mp_branco or 0,
            "mp_integral":            mp_integral or 0,
            "embalagem_parbo":        emb_parbo,
            "energia_parbo":          ene_parbo,
            "embalagem_branco":       emb_branco,
            "energia_branco":         ene_branco,
            "embalagem_integral":     emb_integral,
            "energia_integral":       ene_integral,
            "frete_embutido_parbo":   frete_embutido_parbo,
            "frete_embutido_branco":  frete_embutido_branco,
            "frete_embutido_integral": frete_embutido_integral,
            "p1_parbo":               round(p1_parbo, 4),
            "p1_branco":              round(p1_branco, 4),
            "p1_integral":            round(p1_integral, 4),
            "comissao_frete_parbo":   round(comissao_frete_parbo, 4),
            "comissao_frete_branco":  round(comissao_frete_branco, 4),
            "comissao_frete_integral": round(comissao_frete_integral, 4),
        }

    result = []
    for row in rows:
        new_row = dict(row)
        ctx_f1 = _make_ctx(row)
        new_row["comissao_frete_parbo"]    = ctx_f1["comissao_frete_parbo"]
        new_row["comissao_frete_branco"]   = ctx_f1["comissao_frete_branco"]
        new_row["comissao_frete_integral"] = ctx_f1["comissao_frete_integral"]
        new_row["p1_parbo"]                = ctx_f1["p1_parbo"]
        new_row["p1_branco"]               = ctx_f1["p1_branco"]
        new_row["p1_integral"]             = ctx_f1["p1_integral"]
        for calc in calculos_ativos:
            new_row[calc["id"]] = round(v, 4) if (v := _safe_eval(calc["formula"], ctx_f1)) is not None else None
        for suffix, key in (("_f2", "meta_frete_2"), ("_f3", "meta_frete_3")):
            frete_extra = row.get(key)
            if frete_extra is not None:
                ctx_fx = _make_ctx(row, meta_frete_override=float(frete_extra))
                for calc in calculos_ativos:
                    v = _safe_eval(calc["formula"], ctx_fx)
                    new_row[calc["id"] + suffix] = round(v, 4) if v is not None else None
                new_row["comissao_frete_parbo_" + suffix.replace("_", "")]    = ctx_fx["comissao_frete_parbo"]
                new_row["comissao_frete_branco_" + suffix.replace("_", "")]   = ctx_fx["comissao_frete_branco"]
                new_row["comissao_frete_integral_" + suffix.replace("_", "")] = ctx_fx["comissao_frete_integral"]
                new_row["p1_parbo_" + suffix.replace("_", "")]                = ctx_fx["p1_parbo"]
                new_row["p1_branco_" + suffix.replace("_", "")]               = ctx_fx["p1_branco"]
                new_row["p1_integral_" + suffix.replace("_", "")]             = ctx_fx["p1_integral"]
        result.append(new_row)
    return result
