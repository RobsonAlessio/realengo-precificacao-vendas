#!/bin/bash
# Script interativo de rollback do sistema precificacao.
# Lista versões registradas no changelog, associa ao backup versionado
# e ao commit git, e executa o restore via restore_db.sh.
#
# Uso: bash /home/suporte/precificacao/scripts/rollback.sh
# Deve ser executado no host (não dentro do container).

set -euo pipefail

BACKUP_DIR="/home/suporte/precificacao/backups"
SCRIPTS_DIR="/home/suporte/precificacao/scripts"
CONTAINER="precificacao-db"
DB_USER="precificacao"
DB_NAME="precificacao"
REPO_DIR="/home/suporte/precificacao"

# ── Pré-requisitos ─────────────────────────────────────────────────────────────
if ! docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "ERRO: container $CONTAINER não está rodando." >&2
  exit 1
fi

# ── Consulta versões únicas no changelog ──────────────────────────────────────
# Retorna a entrada mais recente por versão: versao|data_lancamento|git_commit|criado_por
QUERY="
SELECT DISTINCT ON (versao)
    versao,
    data_lancamento::text,
    COALESCE(git_commit, '') AS git_commit,
    COALESCE(criado_por, 'N/A') AS criado_por
FROM changelog_entries
ORDER BY versao DESC, criado_em DESC;
"

RAW=$(docker exec "$CONTAINER" \
  psql -U "$DB_USER" -d "$DB_NAME" \
  -t -A -F'|' \
  -c "$QUERY" 2>/dev/null)

if [ -z "$RAW" ]; then
  echo "Nenhuma versão encontrada no changelog."
  exit 0
fi

# ── Exibe cabeçalho ───────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║            SISTEMA DE ROLLBACK — PRECIFICACAO REALENGO                     ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
printf "%-4s %-10s %-12s %-10s %-18s %s\n" \
  "#" "VERSÃO" "DATA" "COMMIT" "REGISTRADO POR" "BACKUP"
echo "──────────────────────────────────────────────────────────────────────────────────────"

declare -a VERSOES=()
declare -a BACKUPS=()
IDX=0

while IFS='|' read -r versao data_lanc git_commit criado_por; do
  IDX=$((IDX + 1))

  # Procura backup versionado correspondente
  MATCH=$(ls "${BACKUP_DIR}/precificacao_v${versao}_"*.sql.gz 2>/dev/null | sort | tail -1 || true)
  if [ -n "$MATCH" ]; then
    BACKUP_DISPLAY=$(basename "$MATCH")
  else
    BACKUP_DISPLAY="(sem backup versionado)"
  fi

  SHORT_COMMIT="${git_commit:0:8}"
  [ -z "$SHORT_COMMIT" ] && SHORT_COMMIT="N/A"

  printf "%-4s %-10s %-12s %-10s %-18s %s\n" \
    "$IDX" "$versao" "$data_lanc" "$SHORT_COMMIT" "$criado_por" "$BACKUP_DISPLAY"

  VERSOES+=("$versao")
  BACKUPS+=("$MATCH")
done <<< "$RAW"

echo ""

# ── Seleção da versão ──────────────────────────────────────────────────────────
read -r -p "Digite o número da versão para restaurar (ou Enter para cancelar): " ESCOLHA

if [ -z "$ESCOLHA" ]; then
  echo "Rollback cancelado."
  exit 0
fi

if ! [[ "$ESCOLHA" =~ ^[0-9]+$ ]] || [ "$ESCOLHA" -lt 1 ] || [ "$ESCOLHA" -gt "$IDX" ]; then
  echo "ERRO: seleção inválida." >&2
  exit 1
fi

VERSAO_ESCOLHIDA="${VERSOES[$((ESCOLHA - 1))]}"
BACKUP_ESCOLHIDO="${BACKUPS[$((ESCOLHA - 1))]}"

# ── Resolve backup se não há versionado ───────────────────────────────────────
if [ -z "$BACKUP_ESCOLHIDO" ]; then
  echo ""
  echo "AVISO: Não há backup versionado para v${VERSAO_ESCOLHIDA}."
  echo "Backups disponíveis (por data):"
  echo ""
  ls -lht "${BACKUP_DIR}"/precificacao_*.sql.gz 2>/dev/null | head -15 || echo "  Nenhum backup encontrado."
  echo ""
  read -r -p "Digite o caminho completo do backup a usar (ou Enter para cancelar): " BACKUP_MANUAL
  if [ -z "$BACKUP_MANUAL" ]; then
    echo "Rollback cancelado."
    exit 0
  fi
  BACKUP_ESCOLHIDO="$BACKUP_MANUAL"
fi

# ── Resumo ─────────────────────────────────────────────────────────────────────
GIT_SHA=$(docker exec "$CONTAINER" \
  psql -U "$DB_USER" -d "$DB_NAME" \
  -t -A -F'|' \
  -c "SELECT COALESCE(git_commit,'') FROM changelog_entries WHERE versao='${VERSAO_ESCOLHIDA}' AND git_commit IS NOT NULL ORDER BY criado_em DESC LIMIT 1;" \
  2>/dev/null | head -1 || true)

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  RESUMO DO ROLLBACK"
echo "══════════════════════════════════════════════════════════════"
echo "  Versão selecionada : v${VERSAO_ESCOLHIDA}"
echo "  Arquivo de backup  : $(basename "$BACKUP_ESCOLHIDO")"
echo "  Tamanho do backup  : $(du -sh "$BACKUP_ESCOLHIDO" | cut -f1)"

if [ -n "$GIT_SHA" ]; then
  echo "  Commit git         : ${GIT_SHA}"
  if git -C "$REPO_DIR" cat-file -e "${GIT_SHA}^{commit}" 2>/dev/null; then
    MSG=$(git -C "$REPO_DIR" log --format='%s' -1 "$GIT_SHA" 2>/dev/null || echo "N/A")
    DT=$(git -C "$REPO_DIR" log --format='%ci' -1 "$GIT_SHA" 2>/dev/null || echo "N/A")
    echo "  Mensagem do commit : ${MSG}"
    echo "  Data do commit     : ${DT}"
  fi
fi

echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  ATENÇÃO: Esta operação irá SOBRESCREVER o banco '$DB_NAME'."
echo "  O código da aplicação NÃO será revertido automaticamente."
if [ -n "$GIT_SHA" ]; then
  echo ""
  echo "  Para reverter o código também, execute APÓS o restore:"
  echo "    git -C ${REPO_DIR} checkout ${GIT_SHA}"
  echo "    docker compose -f ${REPO_DIR}/docker-compose.yml restart backend frontend"
fi
echo ""

# ── Confirmação e execução ────────────────────────────────────────────────────
read -r -p "Confirmar rollback do banco para v${VERSAO_ESCOLHIDA}? [sim/N] " CONFIRMA
if [ "$CONFIRMA" != "sim" ]; then
  echo "Rollback cancelado."
  exit 0
fi

echo ""
echo "[rollback] Iniciando restore via restore_db.sh..."
bash "${SCRIPTS_DIR}/restore_db.sh" "$BACKUP_ESCOLHIDO"

echo ""
echo "[rollback] Banco restaurado para v${VERSAO_ESCOLHIDA}."

if [ -n "$GIT_SHA" ]; then
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  PRÓXIMOS PASSOS PARA REVERTER O CÓDIGO:"
  echo "══════════════════════════════════════════════════════════════"
  echo "  1. git -C ${REPO_DIR} checkout ${GIT_SHA}"
  echo "  2. docker compose -f ${REPO_DIR}/docker-compose.yml build --no-cache backend frontend"
  echo "  3. docker compose -f ${REPO_DIR}/docker-compose.yml up -d"
  echo "══════════════════════════════════════════════════════════════"
fi
