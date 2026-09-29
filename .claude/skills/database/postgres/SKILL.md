---
name: database-postgres
description: Use ao trabalhar com PostgreSQL — queries, migrações, índices, JSON, transações. Keywords: postgres, psql.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# PostgreSQL

RDBMS open-source com tipos ricos, JSON/JSONB, full-text, transações ACID, MVCC, índices avançados (B-tree, GIN, GiST, BRIN, HNSW via extensão). Baseline: **PostgreSQL 18.6** (imagem `postgres:18`) + Drizzle 0.45.3; Postgres 19 está em beta e fica fora.

## Essência
- **Tipos:** `bigint`, `uuid` (`DEFAULT uuidv7()`, nativo no PG18; `gen_random_uuid()` só para v4 sem ordenação), `timestamptz` (não `timestamp`), `text` (não `varchar(n)`), dinheiro em `bigint` na unidade menor (`amount_minor`) + `currency text`; `numeric(p,s)` só para taxa/quantidade fracionária, `jsonb` (não `json` — binary, indexável).
- **Constraints:** `NOT NULL`, `CHECK`, `UNIQUE`, `FOREIGN KEY ON DELETE {CASCADE|RESTRICT|SET NULL}`.
- **Índices:** B-tree default; GIN para `jsonb`/array/full-text; partial (`WHERE deleted_at IS NULL`); covering (`INCLUDE (col)`). Sempre `CREATE INDEX CONCURRENTLY` em prod.
- **Transações:** default READ COMMITTED; SERIALIZABLE para invariantes globais. `SELECT ... FOR UPDATE` para lock pessimista.
- **JSONB:** operadores `->`, `->>`, `@>`, `?`, `jsonb_path_query`. Índice GIN para queries.
- **CTE & window:** `WITH ... AS (...)`, `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`.
- **Upsert:** `INSERT ... ON CONFLICT (col) DO UPDATE SET ...`.
- **EXPLAIN ANALYZE** antes de otimizar; índice ≠ ganho garantido.
- **Connection pooling:** PgBouncer (transaction mode) em prod; lib cliente respeita pool size.
- **Prepared statements** preferidos para evitar SQLi.
- **VACUUM/ANALYZE:** autovacuum por default; monitorar bloat em tabelas grandes.
- **Extensions:** pgvector 0.8.6 (embeddings), pg_trgm (similarity), postgis. `uuid-ossp` é desnecessário: `uuidv7()` é nativo no 18.
- **Naming de constraint/índice:** sempre explícito, `<table>_<columns>_idx`, `<table>_<columns>_key`, `<table>_<column>_fkey` (tabela completa em `@.contexts/engineering/contracts/postgres.md`).

## Procedimento mínimo
1. Schema com tipos corretos (`timestamptz`, `bigint` para dinheiro, `uuid`), constraints explícitas, FKs com índice.
2. Migrações forward-only (rule `migration`); `CREATE INDEX CONCURRENTLY` em prod.
3. Queries parametrizadas via lib cliente (pg, postgres.js, drizzle, prisma). NUNCA string interpolation.
4. `EXPLAIN (ANALYZE, BUFFERS)` para queries lentas; criar índice quando seq scan dominar.
5. Transações curtas; evitar I/O externo dentro de transaction.
6. Pool tuning: max conns por instância; PgBouncer em frente em prod.

## Anti-patterns
- `SELECT *` em código de produção → liste colunas (alterações de schema quebram silenciosamente).
- `OFFSET` grande para paginação → keyset/cursor pagination.
- N+1 query do ORM → usar `JOIN`/`IN`/dataloader.
- `varchar(n)` por hábito → `text`.
- `float` para dinheiro → `amount_minor bigint` + `currency`.

## Mini-exemplo
```sql
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  external_id text NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_tenant_id_external_id_key UNIQUE (tenant_id, external_id)
);
CREATE INDEX CONCURRENTLY invoices_tenant_id_created_at_idx ON invoices (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY invoices_metadata_gin_idx ON invoices USING gin (metadata jsonb_path_ops);

INSERT INTO invoices (tenant_id, external_id, total_minor, currency) VALUES ($1, $2, $3, $4)
ON CONFLICT (tenant_id, external_id)
DO UPDATE SET total_minor = EXCLUDED.total_minor, updated_at = now();
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/database/postgres.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
