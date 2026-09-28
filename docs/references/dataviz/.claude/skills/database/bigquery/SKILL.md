---
name: database-bigquery
description: Use para BigQuery — SQL analítico, particionamento, clustering, custos. Keywords: bigquery, bq, analytics.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# BigQuery

Data warehouse serverless do GCP. SQL columnar massivamente paralelo. Cobra por **bytes processados** (on-demand) ou **slots** (flat-rate/editions). Particionamento e clustering são chave para custo.

## Essência
- **Dataset → Table → Column.** Schemas tipados (`STRING`, `INT64`, `FLOAT64`, `NUMERIC`/`BIGNUMERIC`, `BOOL`, `DATE`, `TIMESTAMP`, `DATETIME`, `STRUCT`, `ARRAY`, `JSON`, `GEOGRAPHY`).
- **Partitioning:** por `DATE`/`TIMESTAMP` (daily) ou inteiro range. Reduz bytes lidos: queries com `WHERE _PARTITIONTIME / partition_col` escaneiam só partições relevantes.
- **Clustering:** até 4 colunas; ordena dados dentro de partição. Acelera filtros e agregações nessas colunas.
- **Custo:** `--dry-run` (CLI) ou `EXPLAIN` mostra bytes estimados ANTES de rodar. `SELECT *` em tabela grande = $$$.
- **Materialized views** e **scheduled queries** para agregações pré-computadas.
- **Streaming inserts** via `tabledata.insertAll` (mais caro, dedup com `insertId`) vs **batch loads** (grátis).
- **DML:** `INSERT/UPDATE/DELETE/MERGE` suportados, mas BigQuery é OLAP — UPDATE caro; favoreça append-only + view com `ROW_NUMBER`.
- **Authorized views / row-level security** para multi-tenant.
- **Nested/repeated:** `STRUCT` + `ARRAY` permitem semi-relacional sem JOIN. `UNNEST(array)` em queries.
- **Window functions** robustas. **APPROX_*** funções (`APPROX_COUNT_DISTINCT`) para escala.
- **Stored procedures e UDFs** (SQL e JS).
- **External tables** (BigLake) para query direta em GCS/Sheets sem ingestion.

## Procedimento mínimo
1. Modelar tabela com **partition column** (geralmente data do evento) + **cluster columns** (tenant_id, user_id, etc).
2. Queries sempre com filtro na partition column.
3. `SELECT` listando colunas — nunca `SELECT *` em fato grande.
4. `--dry-run` antes de query nova em tabela grande.
5. Append-only + view com `QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1` em vez de UPDATE.
6. Para multi-tenant: filtro por tenant_id em row-access-policy ou view autorizada.

## Anti-patterns
- `SELECT *` em tabela petabyte → custo explode.
- Tabela sem particionamento varrida full → bytes scaneados absurdos.
- `UPDATE` em fato grande → caro e lento; design para append-only.
- Streaming insert sem `insertId` → duplicação possível.

## Mini-exemplo
```sql
CREATE TABLE `proj.ds.events` (
  event_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  user_id STRING,
  event_name STRING,
  properties JSON,
  occurred_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY tenant_id, user_id;

-- Query barata
SELECT event_name, COUNT(*) AS n
FROM `proj.ds.events`
WHERE DATE(occurred_at) BETWEEN '2026-05-01' AND '2026-05-25'
  AND tenant_id = @tenant
GROUP BY event_name;
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/database/bigquery.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
