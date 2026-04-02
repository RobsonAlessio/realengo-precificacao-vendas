#!/bin/bash
# Backup do banco precificacao via pg_dump
# Executa dentro do container precificacao-db
# Mantém os últimos 30 arquivos; remove os mais antigos automaticamente.
#
# Uso manual:   bash /home/suporte/precificacao/scripts/backup_db.sh
# Agendado por: crontab (ver crontab -l)

set -euo pipefail

BACKUP_DIR="/home/suporte/precificacao/backups"
CONTAINER="precificacao-db"
DB_USER="precificacao"
DB_NAME="precificacao"
MANTER_ULTIMOS=30
ARQUIVO="${BACKUP_DIR}/precificacao_$(date +%Y%m%d_%H%M%S).sql.gz"

# Verifica se o container está rodando
if ! docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "[backup_db] ERRO: container $CONTAINER não está rodando." >&2
  exit 1
fi

# Gera o dump comprimido
docker exec "$CONTAINER" \
  pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "$ARQUIVO"

echo "[backup_db] Backup criado: $ARQUIVO ($(du -sh "$ARQUIVO" | cut -f1))"

# Remove backups mais antigos, mantendo os últimos N
TOTAL=$(ls -1t "${BACKUP_DIR}"/precificacao_*.sql.gz 2>/dev/null | wc -l)
if [ "$TOTAL" -gt "$MANTER_ULTIMOS" ]; then
  REMOVER=$(( TOTAL - MANTER_ULTIMOS ))
  ls -1t "${BACKUP_DIR}"/precificacao_*.sql.gz | tail -n "$REMOVER" | xargs rm -f
  echo "[backup_db] Removidos $REMOVER backup(s) antigo(s). Total mantido: $MANTER_ULTIMOS."
fi
