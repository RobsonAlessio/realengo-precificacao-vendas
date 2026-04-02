#!/bin/bash
# Restore do banco precificacao a partir de um backup .sql.gz
#
# Uso: bash /home/suporte/precificacao/scripts/restore_db.sh <arquivo.sql.gz>
# Ex:  bash /home/suporte/precificacao/scripts/restore_db.sh backups/precificacao_20260401_020000.sql.gz

set -euo pipefail

CONTAINER="precificacao-db"
DB_USER="precificacao"
DB_NAME="precificacao"

if [ $# -eq 0 ]; then
  echo "Uso: $0 <arquivo.sql.gz>"
  echo ""
  echo "Backups disponíveis:"
  ls -lht /home/suporte/precificacao/backups/precificacao_*.sql.gz 2>/dev/null || echo "  Nenhum backup encontrado."
  exit 1
fi

ARQUIVO="$1"
if [ ! -f "$ARQUIVO" ]; then
  echo "ERRO: arquivo não encontrado: $ARQUIVO" >&2
  exit 1
fi

echo "ATENÇÃO: Isso vai sobrescrever o banco '$DB_NAME' no container '$CONTAINER'."
read -r -p "Confirmar restore de '$ARQUIVO'? [sim/N] " CONFIRMA
if [ "$CONFIRMA" != "sim" ]; then
  echo "Restore cancelado."
  exit 0
fi

echo "[restore_db] Dropando e recriando banco $DB_NAME..."
docker exec "$CONTAINER" psql -U "$DB_USER" postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS $DB_NAME;" \
  -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "[restore_db] Restaurando de $ARQUIVO..."
gunzip -c "$ARQUIVO" | docker exec -i "$CONTAINER" psql -U "$DB_USER" "$DB_NAME"

echo "[restore_db] Restore concluído com sucesso."
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "SELECT COUNT(*) AS registros_parametros FROM parametros_representante;"
