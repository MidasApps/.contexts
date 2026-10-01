-- Dataset `ai_observability` (contracts/bigquery.md §14; SP5 Task 6, decisions 0026, 0039, 0040).
-- Applied by hand per environment, never at app boot and never locally (the local sink is a no-op):
--   bq query --use_legacy_sql=false --project_id=<project> < app/infra/bigquery/ai_observability.sql
-- Idempotent (IF NOT EXISTS). Evolution is additive (bigquery.md §11): add NULLABLE columns, never
-- rename or retype. Every table is partitioned by day with a required partition filter (§9) and
-- clustered by its most filtered columns (§10). PII (§15): no raw user id or e-mail ever lands here;
-- `user_id_hashed` is the SHA-256 of the uid (`hashUserId` in the usage sink).
CREATE SCHEMA IF NOT EXISTS `ai_observability`
OPTIONS (description = "Model calls, usage rollups and eval results of the agentic core.");

-- One model call per row, exported from usage.llm_calls (insertId = llm_call_id).
CREATE TABLE IF NOT EXISTS `ai_observability.llm_calls` (
  request_id STRING,
  occurred_at TIMESTAMP NOT NULL,
  tenant_id STRING NOT NULL,
  user_id_hashed STRING,
  model STRING NOT NULL,
  prompt_tokens INT64 NOT NULL,
  completion_tokens INT64 NOT NULL,
  cached_tokens INT64 NOT NULL,
  cost_micro_usd INT64,
  latency_ms INT64 NOT NULL,
  finish_reason STRING,
  tool_calls ARRAY<STRUCT<name STRING, arguments JSON, latency_ms INT64>>,
  error STRUCT<code STRING, message STRING>,
  llm_call_id STRING NOT NULL,
  trace_id STRING,
  agent_id STRING NOT NULL,
  provider STRING NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY tenant_id, model
OPTIONS (require_partition_filter = true, partition_expiration_days = 730);

-- Usage per tenant, UTC day, model and agent. Rewritten hourly while the day is open: the current
-- value of a key is the row with the latest exported_at (insertId = hash of the row's content).
CREATE TABLE IF NOT EXISTS `ai_observability.daily_rollups` (
  tenant_id STRING NOT NULL,
  day DATE NOT NULL,
  model STRING NOT NULL,
  agent_id STRING NOT NULL,
  calls INT64 NOT NULL,
  input_tokens INT64 NOT NULL,
  output_tokens INT64 NOT NULL,
  cost_micro_usd INT64 NOT NULL,
  exported_at TIMESTAMP NOT NULL
)
PARTITION BY day
CLUSTER BY tenant_id, model
OPTIONS (require_partition_filter = true, partition_expiration_days = 730);

-- One row per experiment and scorer (eval-export workflow; insertId = experiment_id:scorer:finished_at).
-- Evals run on platform datasets, so there is no tenant column; agent and scorer are the filters.
CREATE TABLE IF NOT EXISTS `ai_observability.eval_runs` (
  experiment_id STRING NOT NULL,
  dataset_id STRING NOT NULL,
  agent_id STRING NOT NULL,
  prompt_version_id STRING,
  status STRING NOT NULL,
  verdict STRING NOT NULL,
  item_count INT64 NOT NULL,
  scorer STRING NOT NULL,
  mean_score FLOAT64 NOT NULL,
  baseline_score FLOAT64,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  exported_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(started_at)
CLUSTER BY agent_id, scorer
OPTIONS (require_partition_filter = true, partition_expiration_days = 1095);
