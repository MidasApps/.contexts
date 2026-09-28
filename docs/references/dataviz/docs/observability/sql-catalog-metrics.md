# SQL Catalog — métricas de observabilidade (Sprint 3.C Task 10)

Este doc lista as três queries SQL canônicas para medir saúde do catálogo
`liquid_meta.sql_catalog` + `liquid_meta.sql_catalog_events` (ADR-0009).

Pré-requisitos:
- Migration `2026-05-04-sql-catalog.sql` aplicada (tabela `sql_catalog`).
- Migration `2026-05-04-sql-catalog-events.sql` aplicada (tabela `sql_catalog_events`).
- `bq.list_validated_queries` em produção (faz log fire-and-forget cada chamada).

Substitua `${project}` pelo projeto BigQuery alvo.

## 1. `catalog_hit_rate` — % de chamadas com hit (curated ou recall) — últimos 7d

```sql
SELECT
  client_id,
  COUNT(*)                                                     AS total_calls,
  SUM(IF(curated_hits > 0, 1, 0))                              AS curated_calls,
  SUM(IF(curated_hits = 0 AND recall_hits > 0, 1, 0))          AS recall_only_calls,
  SUM(IF(total_hits = 0, 1, 0))                                AS empty_calls,
  SAFE_DIVIDE(SUM(IF(curated_hits > 0, 1, 0)), COUNT(*))       AS curated_hit_rate,
  SAFE_DIVIDE(SUM(IF(total_hits > 0, 1, 0)), COUNT(*))         AS combined_hit_rate
FROM `${project}.liquid_meta.sql_catalog_events`
WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY client_id
ORDER BY total_calls DESC;
```

**Alvo (ADR-0009):** `combined_hit_rate >= 0.55` no batch gold.

## 2. `time_to_curate` — média de tempo entre draft e approved

```sql
SELECT
  client_id,
  COUNT(*)                                                                 AS approved_count,
  AVG(TIMESTAMP_DIFF(curated_at, created_at, MINUTE))                      AS avg_minutes_to_curate,
  APPROX_QUANTILES(TIMESTAMP_DIFF(curated_at, created_at, MINUTE), 100)[OFFSET(50)] AS p50_minutes,
  APPROX_QUANTILES(TIMESTAMP_DIFF(curated_at, created_at, MINUTE), 100)[OFFSET(95)] AS p95_minutes
FROM `${project}.liquid_meta.sql_catalog`
WHERE status = 'approved'
  AND curated_at IS NOT NULL
  AND created_at IS NOT NULL
GROUP BY client_id
ORDER BY approved_count DESC;
```

**Sinal:** valores > P95 indicam fila de curadoria em backlog.

## 3. `revalidation_rate` — % de approved hoje em estado `needs_revalidation`

```sql
WITH counts AS (
  SELECT
    client_id,
    COUNTIF(status = 'approved')             AS approved_count,
    COUNTIF(status = 'needs_revalidation')   AS needs_reval_count
  FROM `${project}.liquid_meta.sql_catalog`
  GROUP BY client_id
)
SELECT
  client_id,
  approved_count,
  needs_reval_count,
  SAFE_DIVIDE(needs_reval_count, approved_count + needs_reval_count) AS revalidation_rate
FROM counts
ORDER BY revalidation_rate DESC;
```

**Sinal:** taxa alta indica que glossary/regulatory pack mudaram e o batch
de revalidation cron (Sprint 3.C Task 7) ainda não rodou ou que há
backlog de re-aprovação.

## Operação

- Schedule essas queries via Cloud Scheduler ou Looker Studio para
  dashboards de SRE.
- Alertar quando `combined_hit_rate < 0.4` por 24h em qualquer cliente.
- Alertar quando `revalidation_rate > 0.3` por 7 dias (backlog
  significativo de curadoria).
