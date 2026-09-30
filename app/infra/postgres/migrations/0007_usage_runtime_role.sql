-- Usage ledger isolation and month view (decision 0026, SP3 Task 16). FORCE makes the
-- row level security policies of 0006 apply to the table owner too. The repository
-- runs every query as `SET LOCAL ROLE usage_runtime` inside `withTenantTransaction`,
-- so the policies apply even when the login role could bypass them (local superuser).
-- usage_runtime: NOLOGIN, NOBYPASSRLS; SELECT + INSERT on the append-only ledger,
-- SELECT/INSERT/UPDATE on budgets (SP5 settings write them), SELECT on the view.
-- mastra_runtime (ledger writes, budget checks) and web_runtime (usage summary in
-- /v1, SP5) may switch to it (SET) without inheriting its rights. The view runs with
-- the caller's rights (security_invoker), so it sees only the current tenant's rows.
-- Idempotent. Rollback: DROP VIEW usage.tenant_month_spend; REVOKE usage_runtime
-- FROM mastra_runtime, web_runtime; REVOKE the grants; DROP ROLE usage_runtime
-- (the tables keep their data).
ALTER TABLE "usage"."llm_calls" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage"."tenant_budgets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE VIEW "usage"."tenant_month_spend" WITH (security_invoker = true) AS
SELECT
  tenant_id,
  date_trunc('month', occurred_at AT TIME ZONE 'UTC') AS month_start,
  count(*)::bigint AS calls,
  coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
  coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
  coalesce(sum(cost_micro_usd), 0)::bigint AS cost_micro_usd,
  count(*) FILTER (WHERE cost_micro_usd IS NULL)::bigint AS unpriced_calls
FROM "usage"."llm_calls"
GROUP BY tenant_id, date_trunc('month', occurred_at AT TIME ZONE 'UTC');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'usage_runtime') THEN
    CREATE ROLE usage_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'mastra_runtime')
     AND NOT pg_has_role('mastra_runtime', 'usage_runtime', 'SET') THEN
    GRANT usage_runtime TO mastra_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_runtime')
     AND NOT pg_has_role('web_runtime', 'usage_runtime', 'SET') THEN
    GRANT usage_runtime TO web_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
  -- A non-superuser migrator (Cloud SQL) must be able to SET ROLE for the Postgres tests.
  IF NOT pg_has_role(current_user, 'usage_runtime', 'SET') THEN
    EXECUTE format('GRANT usage_runtime TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON "usage"."llm_calls", "usage"."tenant_budgets", "usage"."tenant_month_spend" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "usage" TO usage_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON "usage"."llm_calls" TO usage_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "usage"."tenant_budgets" TO usage_runtime;
--> statement-breakpoint
GRANT SELECT ON "usage"."tenant_month_spend" TO usage_runtime;
