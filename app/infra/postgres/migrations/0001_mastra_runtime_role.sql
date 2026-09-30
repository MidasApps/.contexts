-- Least-privilege role for the Mastra runtime (decision 0023, SP0 follow-up #1).
-- NOLOGIN: the service account's login role is granted mastra_runtime at deploy.
-- DML only on schema `mastra`; no CREATE, so the runtime cannot run DDL
-- (Mastra's tables come from `pnpm -F @core/mastra db:init`, which re-grants
-- after init). Idempotent. Rollback: REVOKE the grants and DROP ROLE mastra_runtime.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mastra_runtime') THEN
    CREATE ROLE mastra_runtime NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "mastra" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "mastra" TO mastra_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "mastra" TO mastra_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "mastra" TO mastra_runtime;
--> statement-breakpoint
-- Tables and sequences that the migrating role creates later (db:init runs as it).
ALTER DEFAULT PRIVILEGES IN SCHEMA "mastra"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mastra_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "mastra"
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mastra_runtime;
