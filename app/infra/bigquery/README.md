# BigQuery `ai_observability`

DDL of the warehouse tables the core exports to (contracts/bigquery.md §14; decisions 0026, 0039,
0040). The Mastra service writes them through the usage sink (`USAGE_SINK=bigquery`) and the eval
sink; in `local` both sinks are no-ops, so nothing here runs locally.

## Apply (once per environment, by an operator with `roles/bigquery.dataEditor` on the project)

```bash
bq query --use_legacy_sql=false --project_id=<project-id> < app/infra/bigquery/ai_observability.sql
```

The script is idempotent (`IF NOT EXISTS`). Changes are additive only: add a `NULLABLE` column with
`ALTER TABLE ... ADD COLUMN`; never rename, retype or drop (bigquery.md §11).

## Runtime access

- The Mastra service account needs `roles/bigquery.dataEditor` on the dataset (streaming inserts),
  and nothing at project level.
- Analysts query with a partition filter (required on every table) and should set
  `maximumBytesBilled` (governance "Custo de IA e de consultas").

## Tables

| Table | Grain | Written by | Dedup |
|---|---|---|---|
| `llm_calls` | one model call | `usage-report` (ledger rows older than 10 min) | `insertId` = ledger id |
| `daily_rollups` | tenant × UTC day × model × agent | `usage-report` (hourly, yesterday and today) | latest `exported_at` per key |
| `eval_runs` | experiment × scorer | `eval-export` (daily) | `insertId` = experiment:scorer:finish |

Naming exception (contracts/bigquery.md §3.3 asks for singular fact tables): `daily_rollups` and
`eval_runs` keep their plural names. Tables are never renamed in place (§12), and `llm_calls` is the
canonical plural name §14 itself uses.

No raw personal data: user ids are SHA-256 hashed before export (bigquery.md §15).
