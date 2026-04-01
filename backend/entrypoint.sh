#!/bin/sh
# Entrypoint do backend Precificacao.
# Se as tabelas já existem mas o Alembic ainda não rastreou nenhuma revision,
# faz "stamp head" para registrar o estado atual sem re-executar o DDL.
# Em seguida executa "upgrade head" (no-op se já estiver na última revision).

set -e

TABLE_EXISTS=$(python -c "
import os, sqlalchemy
engine = sqlalchemy.create_engine(os.environ['DATABASE_URL'])
with engine.connect() as conn:
    result = conn.execute(sqlalchemy.text(
        \"SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'users'\"
    ))
    print(result.scalar())
")

ALEMBIC_STAMPED=$(python -c "
import os, sqlalchemy
engine = sqlalchemy.create_engine(os.environ['DATABASE_URL'])
with engine.connect() as conn:
    try:
        result = conn.execute(sqlalchemy.text('SELECT COUNT(*) FROM alembic_version'))
        print(result.scalar())
    except Exception:
        print(0)
")

if [ "$TABLE_EXISTS" = "1" ] && [ "$ALEMBIC_STAMPED" = "0" ]; then
    echo "[entrypoint] Tabelas existentes sem revision Alembic — executando stamp head..."
    alembic stamp head
else
    echo "[entrypoint] Executando alembic upgrade head..."
    alembic upgrade head
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8001
