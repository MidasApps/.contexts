---
name: contracts-bigquery
description: Use ao definir contratos BigQuery — dataset, particionamento, schemas. Keywords: bigquery contract, bq schema.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Contracts: BigQuery Schema Conventions

Convenções para datasets/tabelas BigQuery: naming, particionamento, clustering, tipos, nested/repeated, evolução.

## Essência
- **Hierarquia:** `project.dataset.table`. Datasets por **domínio** (`raw`, `staging`, `prod_analytics`, `<domain>`).
- **Naming:** `snake_case` em tabelas e colunas. Tabelas no plural ou descritivas (`events`, `orders_daily`).
- **Layered datasets (medallion):**
  - `raw_*` (bronze): dados brutos como chegaram, append-only.
  - `staging_*` (silver): limpos, deduplicados, tipados.
  - `prod_*` (gold): modelos analíticos prontos para consumo.
- **Partitioning:** sempre — por `DATE(event_time)`, `_PARTITIONTIME` (ingestion-time) ou integer range. Sem partição = full scan.
- **Clustering:** até 4 colunas de filtro frequente (`tenant_id`, `user_id`, `event_name`).
- **Tipos:** `STRING`, `INT64`, `FLOAT64`, `NUMERIC(p,s)` (preciso), `BIGNUMERIC` (super-preciso), `BOOL`, `DATE`, `TIMESTAMP` (UTC), `DATETIME` (sem TZ — evite), `JSON`, `STRUCT`, `ARRAY`.
- **Timestamps em UTC** sempre. Para event time: `occurred_at TIMESTAMP NOT NULL`.
- **Nested/repeated:** `STRUCT<...>` e `ARRAY<>` evitam JOIN; ideal para eventos com props variáveis.
- **Schema evolution:** adicionar coluna nullable ✓; remover coluna ✗ (drop ou create new table); mudar tipo ✗.
- **Required vs nullable:** marcar `NOT NULL` (REQUIRED) só quando absolutamente garantido — REQUIRED não pode ser mudado.
- **Tabelas de fato vs dimensão:** fato (orders, events) append-only; dimensão (users, products) atualizada via MERGE ou view com ROW_NUMBER (SCD type 2 quando histórico importa).
- **Custos no contrato:** documentar partition column obrigatória nas queries (proteção via row-access-policy ou docs).
- **Authorized views / row-level security** para multi-tenant.

## Procedimento mínimo
1. Decidir dataset: `raw` / `staging` / `prod_<domain>`.
2. Definir schema com tipos corretos + partition + clustering.
3. Append-only para fato; MERGE controlado para dimensão.
4. Schema versionado no repo (`schemas/<table>.sql` ou Dataform/dbt).
5. Documentar partition column e clusters em README do dataset (ou descrição da tabela).
6. Para evolução: nova coluna nullable em DDL; deprecar com comentário antes de remover (criar tabela nova).

## Anti-patterns
- Tabela sem particionamento → custo descontrolado.
- `TIMESTAMP` armazenando local time → bug ao mudar timezone.
- `FLOAT64` para dinheiro → use `NUMERIC`.
- Tabela "tudo num lugar" sem dataset por domínio → governance vira caos.
- Schema mudado direto no console sem PR → drift.

## Mini-exemplo
```sql
CREATE TABLE `proj.raw_orders.orders_events` (
  event_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  order_id STRING NOT NULL,
  event_type STRING NOT NULL,             -- 'placed' | 'paid' | 'shipped' | 'cancelled'
  total_cents INT64,
  currency STRING,
  metadata JSON,
  occurred_at TIMESTAMP NOT NULL,
  ingested_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY tenant_id, event_type
OPTIONS (
  description = "Append-only stream of order lifecycle events. Always filter by DATE(occurred_at).",
  partition_expiration_days = 730
);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/bigquery.md`
**Documentação upstream:** MCP `liquid-docs` — busque por `bigquery` para detalhes da versão atual.
