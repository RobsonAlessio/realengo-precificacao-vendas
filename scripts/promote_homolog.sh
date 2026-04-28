#!/bin/bash
# Promove a branch homolog para main e envia ao GitHub.
# Deve ser executado na VM de Homologação.
#
# Uso: bash /home/suporte/precificacao/scripts/promote_homolog.sh

set -euo pipefail

REPO_DIR="/home/suporte/precificacao"
BRANCH_TRABALHO="homolog"
BRANCH_DESTINO="main"

cd "$REPO_DIR"

# ── 1. Verifica branch atual ─────────────────────────────────────────────────
ATUAL=$(git branch --show-current)
if [ "$ATUAL" != "$BRANCH_TRABALHO" ]; then
  echo "[promote] ERRO: você está na branch '$ATUAL', mas o script só roda em '$BRANCH_TRABALHO'." >&2
  echo "          Execute: git checkout $BRANCH_TRABALHO" >&2
  exit 1
fi

# ── 2. Verifica working tree limpo ───────────────────────────────────────────
if ! git diff-index --quiet HEAD --; then
  echo "[promote] ERRO: você tem alterações não commitadas. Comite ou faça stash antes de promover." >&2
  echo "" >&2
  git status --short
  exit 1
fi

# ── 3. Atualiza homolog e busca main ─────────────────────────────────────────
echo "[promote] Atualizando '$BRANCH_TRABALHO'..."
git pull origin "$BRANCH_TRABALHO"

echo "[promote] Buscando '$BRANCH_DESTINO' do remoto..."
git fetch origin "$BRANCH_DESTINO"

# ── 4. Lista commits que serão promovidos ────────────────────────────────────
COMMITS=$(git log --oneline "origin/$BRANCH_DESTINO..$BRANCH_TRABALHO" || true)

if [ -z "$COMMITS" ]; then
  echo "[promote] Nada para promover. '$BRANCH_TRABALHO' não tem commits novos vs '$BRANCH_DESTINO'."
  exit 0
fi

QTD=$(echo "$COMMITS" | wc -l)

echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  Commits que serão promovidos para '$BRANCH_DESTINO' ($QTD commit(s)):"
echo "══════════════════════════════════════════════════════════════════════════════"
echo "$COMMITS"
echo "══════════════════════════════════════════════════════════════════════════════"
echo ""

# ── 5. Confirmação ───────────────────────────────────────────────────────────
read -r -p "Promover para '$BRANCH_DESTINO' e enviar ao GitHub? [s/N] " RESP
if [ "$RESP" != "s" ] && [ "$RESP" != "S" ]; then
  echo "[promote] Operação cancelada."
  exit 0
fi

# ── 6. Merge homolog -> main ─────────────────────────────────────────────────
echo ""
echo "[promote] Trocando para '$BRANCH_DESTINO'..."
git checkout "$BRANCH_DESTINO"
git pull origin "$BRANCH_DESTINO"

MSG_MERGE="merge $BRANCH_TRABALHO into $BRANCH_DESTINO ($(date +%Y-%m-%d))"
echo "[promote] Fazendo merge --no-ff: $BRANCH_TRABALHO -> $BRANCH_DESTINO..."

if ! git merge --no-ff "$BRANCH_TRABALHO" -m "$MSG_MERGE"; then
  echo "" >&2
  echo "[promote] ERRO: conflito de merge detectado." >&2
  echo "          Para resolver:" >&2
  echo "            1) edite os arquivos com marcadores <<<<<<< / =======/ >>>>>>>" >&2
  echo "            2) git add <arquivos>" >&2
  echo "            3) git commit                    (finaliza o merge)" >&2
  echo "            4) git push origin $BRANCH_DESTINO" >&2
  echo "            5) git checkout $BRANCH_TRABALHO  (volta para a branch de trabalho)" >&2
  exit 1
fi

# ── 7. Push main ─────────────────────────────────────────────────────────────
echo "[promote] Enviando '$BRANCH_DESTINO' ao GitHub..."
git push origin "$BRANCH_DESTINO"

# ── 8. Sincroniza homolog com main e volta para ela ──────────────────────────
echo "[promote] Voltando para '$BRANCH_TRABALHO' e sincronizando..."
git checkout "$BRANCH_TRABALHO"
git merge "$BRANCH_DESTINO" --ff-only || true
git push origin "$BRANCH_TRABALHO" || true

# ── 9. Resumo final ──────────────────────────────────────────────────────────
SHA_HEAD=$(git rev-parse HEAD)

echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  Promoção concluída com sucesso"
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  Branch atual         : $BRANCH_TRABALHO"
echo "  Commit final em main : ${SHA_HEAD:0:12}"
echo ""
echo "  PRÓXIMO PASSO: na VM de PRODUÇÃO execute:"
echo "    bash /home/suporte/precificacao/scripts/deploy_prod.sh"
echo "══════════════════════════════════════════════════════════════════════════════"
