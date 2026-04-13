#!/bin/bash
# Cria um backup versionado do banco precificacao, com nome baseado na versão.
# Deve ser executado no host logo após registrar a versão via API/frontend.
#
# Uso: bash /home/suporte/precificacao/scripts/tag_version.sh <versao>
# Ex:  bash /home/suporte/precificacao/scripts/tag_version.sh 1.5.0

set -euo pipefail

BACKUP_DIR="/home/suporte/precificacao/backups"
CONTAINER="precificacao-db"
DB_USER="precificacao"
DB_NAME="precificacao"

if [ $# -eq 0 ]; then
  echo "Uso: $0 <versao>"
  echo "Ex:  $0 1.5.0"
  exit 1
fi

VERSAO="$1"
DATA=$(date +%Y%m%d)
ARQUIVO="${BACKUP_DIR}/precificacao_v${VERSAO}_${DATA}.sql.gz"

# Verifica se o container está rodando
if ! docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "[tag_version] ERRO: container $CONTAINER não está rodando." >&2
  exit 1
fi

# Avisa se já existe backup versionado para esta versão
if ls "${BACKUP_DIR}/precificacao_v${VERSAO}_"*.sql.gz 2>/dev/null | grep -q .; then
  echo "[tag_version] AVISO: já existe um backup para a versão ${VERSAO}:"
  ls -lh "${BACKUP_DIR}/precificacao_v${VERSAO}_"*.sql.gz
  read -r -p "Criar outro mesmo assim? [s/N] " RESP
  if [ "$RESP" != "s" ] && [ "$RESP" != "S" ]; then
    echo "[tag_version] Operação cancelada."
    exit 0
  fi
fi

echo "[tag_version] Criando backup versionado para v${VERSAO}..."
docker exec "$CONTAINER" \
  pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "$ARQUIVO"

echo "[tag_version] Backup criado: $ARQUIVO ($(du -sh "$ARQUIVO" | cut -f1))"
echo "[tag_version] Commit HEAD atual: $(git -C /home/suporte/precificacao rev-parse HEAD)"
echo ""
echo "[tag_version] Próximo passo: certifique-se de que o campo git_commit foi"
echo "              registrado no changelog via API ao criar a entrada da versão."
