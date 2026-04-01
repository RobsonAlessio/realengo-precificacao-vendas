# Precificacao de Vendas Realengo

## Visao Geral

Sistema web para precificacao de vendas da unidade Realengo. Composto por frontend React, backend FastAPI e banco PostgreSQL 16 proprio, orquestrados via Docker Compose.

Diretorio: `/home/suporte/precificacao/`

---

## Stack e Containers

| Container | Tecnologia | Porta | Imagem |
|-----------|-----------|-------|--------|
| `precificacao-frontend` | React 18 + TypeScript + Vite + Ant Design | 3000 | Node (build Vite) |
| `precificacao-backend` | Python 3.x + FastAPI | 8001 | Python slim |
| `precificacao-db` | PostgreSQL 16 | 5434 | postgres:16 |

Iniciar todos os servicos:
```bash
cd /home/suporte/precificacao
docker compose up -d
```

Verificar status:
```bash
docker compose ps
docker compose logs --tail=50 precificacao-backend
```

---

## Fontes de Dados

| Fonte | Caminho | Share de rede | Descricao |
|-------|---------|--------------|-----------|
| Qlik Comercial | `/mnt/qlik_comercial` | `\\192.168.0.222\dados` | Planilhas Excel com dados comerciais e metas |
| DataLake Realengo | `/mnt/datalake_realengo` | `\\192.168.0.193\...` | Parquets gerados pelo Airflow ETL |

**Arquivo principal:**
```
/mnt/qlik_comercial/Qlik/Comercial/Meta Indicador de Tabela de Frete.xlsx
```

**Script de mount do Qlik Comercial:**
```bash
/home/suporte/setups_mounts/setup_mount_qlik_comercial.sh
```

Se o mount estiver ausente, execute o script como root e verifique `/etc/fstab`.

---

## Estrutura de Arquivos

```
/home/suporte/precificacao/
├── docker-compose.yaml        ← orquestracao dos 3 containers
├── CLAUDE.md                  ← este arquivo
├── frontend/                  ← aplicacao React
│   ├── src/
│   │   └── pages/App/
│   │       └── RepresentantesParams/
│   │           └── index.tsx      ← Aba Parametros de Representantes
│   ├── package.json
│   └── vite.config.ts
├── backend/                   ← API FastAPI
│   ├── app/
│   │   ├── models.py              ← User + ParametroRepresentante
│   │   ├── services/
│   │   │   ├── excel_reader.py    ← leitura de planilhas/Parquet
│   │   │   └── representantes_service.py  ← CRUD BD, import parquet, lookup
│   │   └── routes/
│   │       ├── prices.py          ← endpoints de precificacao
│   │       └── representantes.py  ← /representantes/*
│   ├── requirements.txt
│   └── Dockerfile
└── .claude/
    ├── agents/                ← agentes especializados do projeto
    └── commands/              ← skills do projeto
```

---

## Banco de Dados

- Engine: PostgreSQL 16
- Host (externo): `192.168.0.236:5434`
- Host (dentro da rede Docker): `precificacao-db:5432`
- Banco: definido no `docker-compose.yaml` (verificar variavel `POSTGRES_DB`)

Conectar via psql:
```bash
docker compose exec precificacao-db psql -U postgres
```

### Tabelas

#### `parametros_representante`

```sql
CREATE TABLE parametros_representante (
    id              SERIAL PRIMARY KEY,
    representante   VARCHAR(120) NOT NULL,
    data_vigencia   DATE NOT NULL,
    meta_frete_1    NUMERIC(10,4),
    meta_frete_2    NUMERIC(10,4),
    meta_frete_3    NUMERIC(10,4),
    margem_parbo    NUMERIC(8,6),
    margem_branco   NUMERIC(8,6),
    margem_integral NUMERIC(8,6),
    importado_parquet BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em       TIMESTAMP DEFAULT NOW(),
    atualizado_em   TIMESTAMP DEFAULT NOW(),
    UNIQUE (representante, data_vigencia)  -- constraint: uq_rep_data
);
```

Regra: `importado_parquet=FALSE` indica edicao manual — nunca sobrescrito pela importacao automatica.

### Fluxo de Parametros (BD + Parquet)

1. **Startup**: se tabela vazia, importa todos os meses disponiveis do parquet automaticamente
2. **Calculo de precos** (`/prices/tabela`): busca do BD com `data_vigencia <= hoje`; fallback para parquet se nao encontrar
3. **Edicao manual**: via aba Parametros → salvo com `importado_parquet=FALSE`

### Comportamento dos Parquets

- Datas como strings `'YYYY-MM-DD HH:MM:SS'` (nao Timestamps)
- Valores numericos de fretes tambem sao strings (ex: `'18.72'`)
- `_safe_float()` em `excel_reader.py` aceita strings numericas

---

## Endpoints

### `/prices`

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/prices/freight-targets` | Metas de frete + margens + comissao por representante |
| GET | `/prices/custo-mp` | Custo de materia-prima do dia (Empresa 08 e 58) |
| GET | `/prices/tabela` | Calculo de precos com parametros do BD (fallback parquet) |

### `/representantes`

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/representantes/ativos` | Lista representantes ativos do parquet `fat_representante` |
| GET | `/representantes/parametros?ano=X&mes=Y` | Parametros do BD + fallback parquet |
| PUT | `/representantes/parametros` | Upsert de parametros (edicao manual) |
| DELETE | `/representantes/parametros/{id}` | Remove vigencia especifica |
| POST | `/representantes/importar-parquet?ano=X&mes=Y` | Importa mes do parquet para BD |

---

## Padrao de Desenvolvimento

### Backend (FastAPI)
- Endpoints REST em `backend/app/routes/`
- Variaveis de ambiente via `.env` ou `docker-compose.yaml` — nunca hardcodar credenciais
- Leitura de Excel com `pandas` + `openpyxl`; Parquet com `pyarrow`
- Conexao com PostgreSQL via `SQLAlchemy` ou `asyncpg`

### Frontend (React + TypeScript)
- Componentes de UI: Ant Design (`antd`)
- Bundler: Vite
- Chamadas de API via `fetch` ou `axios` apontando para `http://192.168.0.236:8001`
- Tipagem estrita: evitar `any`

### Convencoes gerais
- Portugues brasileiro nos comentarios e documentacao
- Nao commitar arquivos `.env` com credenciais reais
- Migrations de banco documentadas em comentarios ou arquivo dedicado

---

## Padroes Obrigatorios

- Nunca hardcodar IPs, senhas ou tokens no codigo
- Variaveis de ambiente definidas no `docker-compose.yaml` ou `.env` (ignorado pelo git)
- Logs estruturados no backend (usar `logging` padrao ou `loguru`)
- O mount `/mnt/qlik_comercial` deve estar ativo antes de qualquer leitura do Excel

---

## Agentes e Skills

| Agente / Skill | Arquivo | Uso |
|----------------|---------|-----|
| `precificacao-expert` | `~/.claude/agents/precificacao-expert.md` | Especialista no projeto (contexto global) |

---

## Troubleshooting

| Problema | Causa Provavel | Solucao |
|----------|---------------|---------|
| `FileNotFoundError` no Excel | Mount ausente | Rodar `setup_mount_qlik_comercial.sh` |
| Frontend 502/CORS | Backend fora do ar | `docker compose restart precificacao-backend` |
| Porta 5434 recusada | DB nao subiu | `docker compose up -d precificacao-db` e checar logs |
| `ModuleNotFoundError` no backend | Dependencia faltando | `docker compose build precificacao-backend` |
| Dados desatualizados | Planilha do Qlik nao foi renovada | Verificar data de modificacao em `/mnt/qlik_comercial/Qlik/Comercial/` |
| Parametros do BD nao aparecem no calculo | `data_vigencia` maior que hoje | Verificar datas na aba Parametros |
| Tabela `parametros_representante` nao existe | Banco nao recriou | `docker compose restart precificacao-backend` |
| Valores de 2021 sem margens | Parquet de margens so tem meses recentes | Normal — apenas fretes foram importados para periodos antigos |
