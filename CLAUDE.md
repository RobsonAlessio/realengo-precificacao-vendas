# Precificacao de Vendas Realengo

Stack: React 18 + TS + Vite + Ant Design | Python + FastAPI | PostgreSQL 16
Dir: `/home/suporte/precificacao/`

> `DC=docker compose -f /home/suporte/precificacao/docker-compose.yml`

## Containers

| Serviço | Porta | Tecnologia |
|---------|-------|-----------|
| `frontend` | 3000 | React + Vite |
| `backend` | 8001 | FastAPI |
| `db` | 5434 | PostgreSQL 16 |

## Fontes de Dados

- Planilhas (Qlik): `/mnt/realengo_planilhas` (mount via `setup_mount_realengo_planilhas.sh`)
- DataLake (Parquet): `/mnt/datalake_realengo`
- Google Drive: `/mnt/realengo_google_drive`

## Banco de Dados

- Externo: `192.168.0.236:5434` | Interno: `precificacao-db:5432`
- Acesso: `$DC exec db psql -U postgres`

### `parametros_representante`

```sql
id, representante, data_vigencia, meta_frete_1/2/3, margem_parbo/branco/integral,
importado_parquet (FALSE=manual, nunca sobrescrito), criado_em, atualizado_em
UNIQUE (representante, data_vigencia) -- uq_rep_data
```

**Fluxo:** Startup vazio → importa parquet | `/prices/tabela` → BD (`data_vigencia <= hoje`) com fallback parquet | Edição manual → `importado_parquet=FALSE`

## Endpoints

| Rota | Função |
|------|--------|
| GET `/prices/tabela` | Tabela de precificação |
| GET `/prices/custo-mp` | Custo MP do dia |
| GET `/representantes/ativos` | Lista do parquet `fat_representante` |
| GET `/representantes/parametros?ano=X&mes=Y` | Parâmetros BD + fallback |
| PUT `/representantes/parametros` | Upsert manual |
| DELETE `/representantes/parametros/{id}` | Remove vigência |
| POST `/representantes/importar-parquet?ano=X&mes=Y` | Importa mês do parquet |

## Rebuild (obrigatório após editar `.py`/`.tsx`/`.ts`)

> `restart` não recompila. Sempre `build + up`.

```bash
$DC build --no-cache backend  && $DC up -d backend
$DC build --no-cache frontend && $DC up -d frontend
$DC build --no-cache && $DC up -d   # tudo
```

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Mount ausente | `setup_mount_realengo_planilhas.sh` |
| Backend 502 | `$DC restart backend` |
| Porta 5434 recusada | `$DC up -d db` |
| Dados desatualizados | Verificar DAG `extract_planilhas` no Airflow |
| `data_vigencia` futura | Parâmetros não aparecem no cálculo |

## Padrões

- Nunca hardcodar IPs/senhas — usar env vars do docker-compose
- Português nos comentários; não commitar `.env`
- Parquets: datas/valores como strings → `_safe_float()`

## Changelog

Ao final de sessões com mudanças, pergunte se deseja registrar. SemVer: PATCH/bug fix, MINOR/feature, MAJOR/breaking. Tipos: `adicionado`, `corrigido`, `modificado`, `removido`.

```bash
# Última versão
docker exec precificacao-db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT versao, data_lancamento FROM changelog_entries ORDER BY id DESC LIMIT 1;"'
# Inserir: tabela=changelog_entries, cols=(versao, data_lancamento, tipo, titulo, descricao, criado_em, criado_por)
```