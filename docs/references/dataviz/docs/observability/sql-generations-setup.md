# `liquid_meta.sql_generations` — setup

Tabela cross-tenant para observability de SQLs gerados pelos agentes (Sprint 1.C).

## Provisionamento

```bash
# Pré-requisitos: env vars BIGQUERY_PROJECT_ID e BIGQUERY_LOCATION definidas
pnpm bq:bootstrap-meta
```

Idempotente: re-executar é seguro (`CREATE ... IF NOT EXISTS`).

## Schema

| Campo | Tipo | Notas |
|---|---|---|
| `id` | STRING NOT NULL | UUID por geração |
| `ts` | TIMESTAMP NOT NULL | particionamento |
| `intent` | STRING | descrição em linguagem natural |
| `sql_draft` | STRING | primeira tentativa antes de repair |
| `dry_run_valid` | BOOL | resultado do dry-run |
| `dry_run_error` | STRING | mensagem se inválido |
| `dry_run_bytes` | INT64 | bytes estimados pelo dry-run |
| `repair_attempts` | INT64 | quantos retries via `experimental_repairToolCall` |
| `final_sql` | STRING | SQL efetivamente executado |
| `rows` | INT64 | linhas retornadas |
| `latency_ms` | INT64 | wall-clock do execute |
| `bytes_billed` | INT64 | custo real |
| `success` | BOOL | execute bem-sucedido |
| `error` | STRING | mensagem se falhou |
| `persona_id`, `client_id`, `session_id`, `agent_id` | STRING | contexto |

Particionado por `DATE(ts)` e clusterizado por `client_id, agent_id, success`.

## IAM

- **One-time** (criação do dataset): SA precisa de `bigquery.datasets.create`.
- **Runtime** (escrita): basta `bigquery.tables.updateData` no dataset `liquid_meta`.
- Em ambientes com org policy restritiva, criar dataset manualmente e dar à SA somente write na tabela.
- Recomendado: role custom `liquid.metaWriter` agrupando `bigquery.jobs.create` + `bigquery.tables.updateData`.

## Multi-tenancy (ADR-0006)

`client_id` é server-bound em todas as inserções — vem do `ToolContext.dataset`, jamais de input do modelo. Queries de leitura por humanos devem filtrar `WHERE client_id = '<tenant>'` para não vazar dados cross-tenant.
