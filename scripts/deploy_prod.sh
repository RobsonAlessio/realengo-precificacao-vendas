#!/bin/bash
# Atualiza a VM de Produção com a versão mais recente de origin/main.
# Faz backup, pull, rebuild seletivo, healthcheck e orienta o registro de changelog.
#
# Uso: bash /home/suporte/precificacao/scripts/deploy_prod.sh

set -euo pipefail

REPO_DIR="/home/suporte/precificacao"
COMPOSE_FILE="${REPO_DIR}/docker-compose.yml"
SCRIPTS_DIR="${REPO_DIR}/scripts"
BRANCH_DESTINO="main"
DC=(docker compose -f "$COMPOSE_FILE")
HEALTHCHECK_TIMEOUT=60
DB_CONTAINER="precificacao-db"
BACKEND_CONTAINER="precificacao-backend"

cd "$REPO_DIR"

# ── 1. Verifica branch ───────────────────────────────────────────────────────
ATUAL=$(git branch --show-current)
if [ "$ATUAL" != "$BRANCH_DESTINO" ]; then
  echo "[deploy] ERRO: você está em '$ATUAL'. O deploy só roda em '$BRANCH_DESTINO'." >&2
  echo "         Execute: git checkout $BRANCH_DESTINO" >&2
  exit 1
fi

# ── 2. Verifica working tree limpo ───────────────────────────────────────────
if ! git diff-index --quiet HEAD --; then
  echo "[deploy] ERRO: working tree tem alterações não commitadas. Resolva antes do deploy." >&2
  echo "" >&2
  git status --short
  exit 1
fi

# ── 3. Backup do banco ───────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  PASSO 1/5 — Backup do banco"
echo "══════════════════════════════════════════════════════════════════════════════"
bash "${SCRIPTS_DIR}/backup_db.sh"

# ── 4. Busca atualizações do remoto ──────────────────────────────────────────
SHA_ANTES=$(git rev-parse HEAD)

echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  PASSO 2/5 — Verificando atualizações no GitHub"
echo "══════════════════════════════════════════════════════════════════════════════"
git fetch origin "$BRANCH_DESTINO"

SHA_REMOTO=$(git rev-parse "origin/$BRANCH_DESTINO")
if [ "$SHA_ANTES" = "$SHA_REMOTO" ]; then
  echo "[deploy] Já está atualizado (HEAD = ${SHA_ANTES:0:12}). Nada a fazer."
  exit 0
fi

# ── 5. Mostra o que mudou ────────────────────────────────────────────────────
echo ""
echo "Commits novos:"
echo "──────────────────────────────────────────────────────────────────────────────"
git log --oneline "$SHA_ANTES..$SHA_REMOTO"
echo "──────────────────────────────────────────────────────────────────────────────"
echo ""

ARQUIVOS_MUDADOS=$(git diff --name-only "$SHA_ANTES" "$SHA_REMOTO")
echo "Arquivos modificados:"
echo "$ARQUIVOS_MUDADOS" | sed 's/^/  /'
echo ""

# ── 6. Confirmação ───────────────────────────────────────────────────────────
read -r -p "Aplicar este deploy em PRODUÇÃO? [sim/N] " RESP
if [ "$RESP" != "sim" ]; then
  echo "[deploy] Operação cancelada."
  exit 0
fi

# ── 7. Pull ──────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  PASSO 3/5 — Atualizando código"
echo "══════════════════════════════════════════════════════════════════════════════"
git pull origin "$BRANCH_DESTINO"

# ── 8. Detecta o que precisa rebuildar ───────────────────────────────────────
REBUILD_BACKEND=false
REBUILD_FRONTEND=false
REBUILD_FULL=false

if echo "$ARQUIVOS_MUDADOS" | grep -qE "^docker-compose\.yml$"; then
  REBUILD_FULL=true
fi
if echo "$ARQUIVOS_MUDADOS" | grep -qE "^backend/.*\.(py|txt)$|^backend/Dockerfile$"; then
  REBUILD_BACKEND=true
fi
if echo "$ARQUIVOS_MUDADOS" | grep -qE "^frontend/.*\.(ts|tsx|js|jsx|css|html|json|svg|ico)$|^frontend/Dockerfile$"; then
  REBUILD_FRONTEND=true
fi

# Se nenhuma classificação bateu mas houve mudanças, faz full por segurança
if [ "$REBUILD_FULL" = false ] && [ "$REBUILD_BACKEND" = false ] && [ "$REBUILD_FRONTEND" = false ]; then
  echo "[deploy] Não foi possível classificar as mudanças — aplicando rebuild completo por segurança."
  REBUILD_FULL=true
fi

# ── 9. Rebuild ───────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  PASSO 4/5 — Rebuild dos containers"
echo "══════════════════════════════════════════════════════════════════════════════"

if [ "$REBUILD_FULL" = true ]; then
  echo "[deploy] Rebuild COMPLETO (docker-compose.yml mudou ou mudanças não classificáveis)."
  "${DC[@]}" build --no-cache
  "${DC[@]}" up -d
else
  if [ "$REBUILD_BACKEND" = true ]; then
    echo "[deploy] Rebuild backend..."
    "${DC[@]}" build --no-cache backend
    "${DC[@]}" up -d backend
  fi
  if [ "$REBUILD_FRONTEND" = true ]; then
    echo "[deploy] Rebuild frontend..."
    "${DC[@]}" build --no-cache frontend
    "${DC[@]}" up -d frontend
  fi
fi

# ── 10. Healthcheck ──────────────────────────────────────────────────────────
echo ""
echo "[deploy] Aguardando containers estabilizarem (até ${HEALTHCHECK_TIMEOUT}s)..."
ELAPSED=0
BACKEND_OK=false
while [ $ELAPSED -lt $HEALTHCHECK_TIMEOUT ]; do
  STATE=$(docker inspect --format '{{.State.Status}}' "$BACKEND_CONTAINER" 2>/dev/null || echo "missing")
  if [ "$STATE" = "running" ]; then
    BACKEND_OK=true
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ "$BACKEND_OK" = true ]; then
  echo "[deploy] Backend rodando."
else
  echo "[deploy] AVISO: backend não estabilizou em ${HEALTHCHECK_TIMEOUT}s. Verifique:" >&2
  echo "         ${DC[*]} logs --tail=50 backend" >&2
fi

# ── 11. Sugere registro de changelog ─────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  PASSO 5/5 — Registrar versão no changelog"
echo "══════════════════════════════════════════════════════════════════════════════"

ULTIMA_VERSAO=$(docker exec "$DB_CONTAINER" sh -c \
  'psql -U $POSTGRES_USER -d $POSTGRES_DB -t -A -c "SELECT versao FROM changelog_entries ORDER BY id DESC LIMIT 1;"' \
  2>/dev/null | tr -d ' ' || true)

SHA_DEPOIS=$(git rev-parse HEAD)

echo ""
echo "  Última versão registrada : ${ULTIMA_VERSAO:-(nenhuma)}"
echo "  Commit anterior          : ${SHA_ANTES:0:12}"
echo "  Commit atual             : ${SHA_DEPOIS:0:12}"
echo ""
echo "  Commits incluídos neste deploy:"
git log --oneline "$SHA_ANTES..HEAD" | sed 's/^/    /'
echo ""
echo "  Sugestão de versionamento (SemVer):"
echo "    PATCH  — correção de bug             (ex: 1.10.1)"
echo "    MINOR  — nova funcionalidade         (ex: 1.11.0)"
echo "    MAJOR  — mudança incompatível        (ex: 2.0.0)"
echo ""
echo "  AÇÃO MANUAL: registre a nova versão na UI (página Admin > Changelog)"
echo "               usando os commits acima como descrição."
echo ""
read -r -p "Já registrou no UI? Digite a versão para criar o backup vinculado (Enter p/ pular): " NOVA_VERSAO

if [ -n "$NOVA_VERSAO" ]; then
  bash "${SCRIPTS_DIR}/tag_version.sh" "$NOVA_VERSAO"
fi

# ── 12. Resumo final ─────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  Deploy concluído"
echo "══════════════════════════════════════════════════════════════════════════════"
echo "  De   : ${SHA_ANTES:0:12}"
echo "  Para : ${SHA_DEPOIS:0:12}"
echo ""
echo "  Em caso de problema, reverter com:"
echo "    bash ${SCRIPTS_DIR}/rollback.sh"
echo "══════════════════════════════════════════════════════════════════════════════"
