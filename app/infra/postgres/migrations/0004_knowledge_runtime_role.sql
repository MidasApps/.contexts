-- Knowledge base isolation (decision 0022, SP3 Task 12). FORCE makes the row level
-- security policies of 0003 apply to the table owner too, so only a superuser or a
-- BYPASSRLS role could skip them; the runtime is neither. The repository runs every
-- query as `SET LOCAL ROLE knowledge_runtime` inside `withTenantTransaction`, so
-- the policies apply even when the login role could bypass them (local superuser).
-- knowledge_runtime: NOLOGIN, NOBYPASSRLS, DML on the two tables only, no DDL.
-- mastra_runtime may switch to it (SET) without inheriting its rights. The HNSW
-- index of 0003 is built without CONCURRENTLY on purpose: the tables are new and
-- empty, and the migrator runs in a transaction. Idempotent.
-- Rollback: REVOKE knowledge_runtime FROM mastra_runtime; REVOKE the grants;
-- DROP ROLE knowledge_runtime (the tables keep their data).
ALTER TABLE "ai"."documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai"."chunks_v1" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'knowledge_runtime') THEN
    CREATE ROLE knowledge_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'mastra_runtime')
     AND NOT pg_has_role('mastra_runtime', 'knowledge_runtime', 'SET') THEN
    GRANT knowledge_runtime TO mastra_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
  -- A non-superuser migrator (Cloud SQL) must be able to SET ROLE for the Postgres tests
  -- and the repository; superusers already pass the check.
  IF NOT pg_has_role(current_user, 'knowledge_runtime', 'SET') THEN
    EXECUTE format('GRANT knowledge_runtime TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON "ai"."documents", "ai"."chunks_v1" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "ai" TO knowledge_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."documents", "ai"."chunks_v1" TO knowledge_runtime;
