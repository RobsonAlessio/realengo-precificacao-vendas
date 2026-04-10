# Precificacao de Vendas Realengo

Sistema web de precificação de vendas. Stack: React 18 + TypeScript + Vite + Ant Design | Python + FastAPI | PostgreSQL 16. Diretório: `/home/suporte/precificacao/`

## Containers

| Serviço | Container | Porta | Tecnologia |
|---------|-----------|-------|-----------|
| `frontend` | `precificacao-frontend` | 3000 | React + Vite |
| `backend` | `precificacao-backend` | 8001 | FastAPI |
| `db` | `precificacao-db` | 5434 | PostgreSQL 16 |

> **Importante:** os nomes dos serviços no `docker-compose.yml` são `frontend`, `backend`, `db` (sem prefixo). Use sempre o path completo:
> `docker compose -f /home/suporte/precificacao/docker-compose.yml <comando> <serviço>`

## Fontes de Dados

| Fonte | Caminho |
|-------|---------|
| Planilhas (Qlik) | `/mnt/realengo_planilhas` — mount via `setup_mount_realengo_planilhas.sh` |
| DataLake (Parquet) | `/mnt/datalake_realengo` |
| Google Drive | `/mnt/realengo_google_drive` |

## Banco de Dados

- Host externo: `192.168.0.236:5434` | Docker interno: `precificacao-db:5432`
- `docker compose exec db psql -U postgres`

### Tabela `parametros_representante`

```sql
id, representante, data_vigencia, meta_frete_1/2/3, margem_parbo/branco/integral,
importado_parquet (FALSE = manual, nunca sobrescrito), criado_em, atualizado_em
UNIQUE (representante, data_vigencia)  -- constraint: uq_rep_data
```

### Fluxo de Parâmetros

1. Startup vazio → importa todos os meses do parquet automaticamente
2. `/prices/tabela` → busca BD (`data_vigencia <= hoje`); fallback parquet
3. Edição manual → `importado_parquet=FALSE`

## Endpoints

| Rota | Função |
|------|--------|
| GET `/prices/tabela` | Tabela completa de precificação |
| GET `/prices/custo-mp` | Custo MP do dia |
| GET `/representantes/ativos` | Lista do parquet `fat_representante` |
| GET `/representantes/parametros?ano=X&mes=Y` | Parâmetros BD + fallback |
| PUT `/representantes/parametros` | Upsert manual |
| DELETE `/representantes/parametros/{id}` | Remove vigência |
| POST `/representantes/importar-parquet?ano=X&mes=Y` | Importa mês do parquet |

## Rebuild de Containers (obrigatório após mudanças de código)

> `restart` **não recompila** — apenas reinicia com a imagem antiga. Sempre usar `build + up` após editar `.py`, `.tsx` ou `.ts`.

```bash
# Backend
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache backend
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d backend

# Frontend
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache frontend
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d frontend

# Tudo
docker compose -f /home/suporte/precificacao/docker-compose.yml build --no-cache
docker compose -f /home/suporte/precificacao/docker-compose.yml up -d
```

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Mudanças no código não aparecem | Rebuild obrigatório (ver seção acima) |
| Mount ausente | `setup_mount_realengo_planilhas.sh` |
| Backend fora do ar (502) | `docker compose ... restart backend` |
| Porta 5434 recusada | `docker compose ... up -d db` |
| Dados desatualizados | Verificar DAG `extract_planilhas` no Airflow |
| `data_vigencia` futura | Parâmetros não aparecem no cálculo — verificar datas na aba Parâmetros |

## Padrões

- Nunca hardcodar IPs/senhas — usar variáveis de ambiente do `docker-compose.yml`
- Português nos comentários; não commitar `.env`
- Parquets: datas como strings `'YYYY-MM-DD HH:MM:SS'`; números também como strings → `_safe_float()`

## Agentes

| Agente | Uso |
|--------|-----|
| `precificacao-expert` (`~/.claude/agents/`) | Frontend, backend, banco, Docker |

---

## Histórico de Versões (Changelog)

Ao final de sessões com mudanças, pergunte se deseja registrar e sugira a próxima versão.

**SemVer:** PATCH = bug fix · MINOR = nova feature · MAJOR = breaking change
**Tipos:** `adicionado` · `corrigido` · `modificado` · `removido`

```bash
# Consultar última versão
docker exec precificacao-db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT versao, data_lancamento FROM changelog_entries ORDER BY id DESC LIMIT 1;"'

# Inserir entrada
docker exec precificacao-db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
INSERT INTO changelog_entries (versao, data_lancamento, tipo, titulo, descricao, criado_em, criado_por) VALUES
('"'"'X.Y.Z'"'"', '"'"'YYYY-MM-DD'"'"', '"'"'tipo'"'"', '"'"'Titulo'"'"', '"'"'Descricao'"'"', NOW(), '"'"'usuario'"'"');"'
```
