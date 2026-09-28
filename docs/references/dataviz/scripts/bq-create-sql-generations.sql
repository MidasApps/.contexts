-- dataviz_meta.sql_generations — observability log de toda geração de SQL pelos agentes.
-- Idempotente. Re-executar é seguro.

CREATE SCHEMA IF NOT EXISTS `${PROJECT_ID}.dataviz_meta`
  OPTIONS (location = '${BQ_LOCATION}');

CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.dataviz_meta.sql_generations` (
  id STRING NOT NULL,
  ts TIMESTAMP NOT NULL,
  intent STRING,
  sql_draft STRING,
  dry_run_valid BOOL,
  dry_run_error STRING,
  dry_run_bytes INT64,
  repair_attempts INT64,
  final_sql STRING,
  rows INT64,
  latency_ms INT64,
  bytes_billed INT64,
  success BOOL,
  error STRING,
  persona_id STRING,
  client_id STRING,
  session_id STRING,
  agent_id STRING
)
PARTITION BY DATE(ts)
CLUSTER BY client_id, agent_id, success;
