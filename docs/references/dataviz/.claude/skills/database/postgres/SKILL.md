---
name: database-postgres
description: Use ao trabalhar com PostgreSQL — queries, migrações, índices, JSON, transações. Keywords: postgres, psql.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# PostgreSQL

RDBMS open-source com tipos ricos, JSON/JSONB, full-text, transações ACID, MVCC, índices avançados (B-tree, GIN, GiST, BRIN, HNSW via extensão).

## Essência
- **Tipos:** `bigint`, `uuid` (`gen_random_uuid()` com pgcrypto/pgsodium), `timestamptz` (não `timestamp`), `text` (não `varchar(n)`), `numeric(p,s)` para dinheiro, `jsonb` (não `json` — binary, indexável).
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
- **Extensions:** pgvector (embeddings), pg_trgm (similarity), uuid-ossp, postgis.

## Procedimento mínimo
1. Schema com tipos corretos (`timestamptz`, `numeric`, `uuid`), constraints explícitas, FKs com índice.
2. Migrações forward-only (skill `migration`); `CREATE INDEX CONCURRENTLY` em prod.
3. Queries parametrizadas via lib cliente (pg, postgres.js, drizzle, prisma). NUNCA string interpolation.
4. `EXPLAIN (ANALYZE, BUFFERS)` para queries lentas; criar índice quando seq scan dominar.
5. Transações curtas; evitar I/O externo dentro de transaction.
6. Pool tuning: max conns por instância; PgBouncer em frente em prod.

## Anti-patterns
- `SELECT *` em código de produção → liste colunas (alterações de schema quebram silenciosamente).
- `OFFSET` grande para paginação → keyset/cursor pagination.
- N+1 query do ORM → usar `JOIN`/`IN`/dataloader.
- `varchar(n)` por hábito → `text`.
- `float` para dinheiro → `numeric(18,4)` ou centavos `bigint`.

## Mini-exemplo
```sql
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX CONCURRENTLY ON invoices(tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY ON invoices USING gin (metadata jsonb_path_ops);

INSERT INTO invoices (tenant_id, total_cents) VALUES ($1, $2)
ON CONFLICT (tenant_id, external_id) DO UPDATE SET total_cents = EXCLUDED.total_cents;
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/database/postgres.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
