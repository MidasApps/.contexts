-- `/v1/organizations/{organizationId}/knowledge/*` (SP3 Task 14) reads and deletes knowledge
-- documents from the web app, through the same repository as Mastra: every transaction runs
-- `SET LOCAL ROLE knowledge_runtime`, so the web login role must be allowed to switch to it.
-- web_runtime: NOLOGIN group role with no privileges of its own; deploy grants it to the web
-- service's database user (Cloud SQL IAM user). It may SET ROLE knowledge_runtime without
-- inheriting its rights, like mastra_runtime (0004). Idempotent.
-- Rollback: REVOKE knowledge_runtime FROM web_runtime; DROP ROLE web_runtime.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_runtime') THEN
    CREATE ROLE web_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT pg_has_role('web_runtime', 'knowledge_runtime', 'SET') THEN
    GRANT knowledge_runtime TO web_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
END
$$;
