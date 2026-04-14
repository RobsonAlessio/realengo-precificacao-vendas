# Guia de Deploy e Versionamento

## 1. Commit e Push

```bash
# Adicionar arquivos alterados
git add arquivo1 arquivo2 ...

# Commitar
git commit -m "tipo: descricao breve da mudanca"

# Enviar para o remoto
git push
```

**Tipos de commit:** `feat` (novo), `fix` (correção), `chore` (manutenção), `refactor`, `docs`

## 2. Rebuild dos Containers

```bash
# Backend (após alterar .py ou requirements.txt)
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache backend
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d backend

# Frontend (após alterar .tsx, .ts ou package.json)
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache frontend
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d frontend

# Tudo
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d
```

> `restart` nao recompila — sempre usar `build + up`.

## 3. Registrar no Changelog

Pegar o SHA do commit e inserir no banco:

```bash
COMMIT_SHA=$(git rev-parse HEAD)

docker exec precificacao-db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
INSERT INTO changelog_entries (versao, data_lancamento, tipo, titulo, descricao, criado_em, criado_por, git_commit) VALUES
('"'"'X.Y.Z'"'"', '"'"'YYYY-MM-DD'"'"', '"'"'tipo'"'"', '"'"'Titulo'"'"', '"'"'Descricao'"'"', NOW(), '"'"'usuario'"'"', '"'"''"$COMMIT_SHA"''"'"');"'
```

**Tipos validos:** `adicionado` | `corrigido` | `modificado` | `removido`

**Versionamento (SemVer):**
- MAJOR (X) = breaking change
- MINOR (Y) = nova feature
- PATCH (Z) = bug fix / correção

Consultar ultima versao:

```bash
docker exec precificacao-db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT versao, data_lancamento FROM changelog_entries ORDER BY id DESC LIMIT 1;"'
```

## 4. Criar Backup Versionado

```bash
bash /home/suporte/precificacao/scripts/tag_version.sh X.Y.Z
```

Gera `backups/precificacao_vX.Y.Z_YYYYMMDD.sql.gz`.

## 5. Recuperar Versao Anterior

### Opcao A: Rollback interativo (banco + orientacao de codigo)

```bash
bash /home/suporte/precificacao/scripts/rollback.sh
```

Lista as versoes do changelog, mostra backups disponiveis e restaura o banco. Ao final, indica os comandos para reverter o codigo.

### Opcao B: Rollback manual passo a passo

```bash
# 1. Ver versoes disponiveis
docker exec precificacao-db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT versao, data_lancamento, COALESCE(git_commit,'"'"'N/A'"'"') AS commit
FROM changelog_entries ORDER BY id DESC;"'

# 2. Restaurar o banco a partir de um backup
bash /home/suporte/precificacao/scripts/restore_db.sh backups/precificacao_vX.Y.Z_YYYYMMDD.sql.gz

# 3. Reverter o codigo para o commit da versao
git checkout <sha_do_commit>

# 4. Rebuildar e subir
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d
```

### Opcao C: Reverter apenas o ultimo commit (sem mexer no banco)

```bash
git revert HEAD
git push
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d
```

## Resumo Rapido

| Acao | Comando |
|------|---------|
| Commit + push | `git add . && git commit -m "msg" && git push` |
| Rebuild backend | `docker compose ... build --no-cache backend && docker compose ... up -d backend` |
| Registrar versao | INSERT no changelog + `tag_version.sh X.Y.Z` |
| Rollback completo | `rollback.sh` (interativo) |
| Reverter ultimo commit | `git revert HEAD && git push` + rebuild |
