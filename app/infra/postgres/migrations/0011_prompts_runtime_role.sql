-- Prompt store isolation (decision 0038, SP5 Task 9). FORCE makes the 0010 policies apply to the
-- table owner too; the repository runs every query as `SET LOCAL ROLE prompts_runtime` inside
-- `withTenantTransaction`, so a tenant's addendum is visible only under its `app.tenant_id` and
-- platform rows (tenant_id IS NULL) under any. prompts_runtime: NOLOGIN, NOBYPASSRLS; SELECT and
-- INSERT on both tables (append-only: every write is a new version or a new activation), and
-- UPDATE of the eval columns only, so a run of `run-prompt-eval` can record its verdict on the
-- version. mastra_runtime (instructions, eval verdicts) and web_runtime (/v1 prompt APIs) may
-- switch to it (SET) without inheriting its rights.
-- Idempotent. Rollback: REVOKE prompts_runtime FROM mastra_runtime, web_runtime; REVOKE the
-- grants; DROP ROLE prompts_runtime (the tables keep their data).
ALTER TABLE "agents"."prompt_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agents"."prompt_activations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prompts_runtime') THEN
    CREATE ROLE prompts_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'mastra_runtime')
     AND NOT pg_has_role('mastra_runtime', 'prompts_runtime', 'SET') THEN
    GRANT prompts_runtime TO mastra_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_runtime')
     AND NOT pg_has_role('web_runtime', 'prompts_runtime', 'SET') THEN
    GRANT prompts_runtime TO web_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
  -- A non-superuser migrator (Cloud SQL) must be able to SET ROLE for the Postgres tests.
  IF NOT pg_has_role(current_user, 'prompts_runtime', 'SET') THEN
    EXECUTE format('GRANT prompts_runtime TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON "agents"."prompt_versions", "agents"."prompt_activations" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "agents" TO prompts_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON "agents"."prompt_versions", "agents"."prompt_activations" TO prompts_runtime;
--> statement-breakpoint
GRANT UPDATE ("eval_experiment_id", "eval_verdict", "updated_at") ON "agents"."prompt_versions" TO prompts_runtime;
