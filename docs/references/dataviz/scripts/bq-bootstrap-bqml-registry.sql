CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.dataviz_meta.bqml_model_registry` (
  hash STRING NOT NULL,
  client_id STRING NOT NULL,
  intent STRING NOT NULL,
  model_type STRING NOT NULL,
  model_ref STRING NOT NULL,
  features_canonical STRING NOT NULL,
  target STRING,
  safra_window_end DATE,
  source_columns_ddl_hash STRING NOT NULL,
  train_bytes INT64,
  train_cost_usd FLOAT64,
  metrics_json JSON,
  created_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  use_count INT64
)
PARTITION BY DATE(created_at)
CLUSTER BY client_id, intent;

CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.dataviz_meta.bqml_invocations` (
  id STRING NOT NULL,
  ts TIMESTAMP NOT NULL,
  client_id STRING,
  session_id STRING,
  agent_id STRING,
  tool_name STRING,
  intent STRING,
  hash STRING,
  model_ref STRING,
  cache_hit BOOL,
  bytes_estimated INT64,
  bytes_processed INT64,
  cost_usd FLOAT64,
  duration_ms INT64,
  success BOOL,
  error STRING,
  approved_by_user BOOL
)
PARTITION BY DATE(ts)
CLUSTER BY client_id, tool_name, success;
