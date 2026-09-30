-- Baseline (decision 0023): the objects of infra/postgres/init/001-schemas.sql,
-- so remote databases get them from migrations. Idempotent on purpose: local
-- volumes already ran the init script. Irreversible only in the sense that a
-- rollback keeps these objects (nothing here holds data).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "mastra";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "ai";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'semantic_owner') THEN
    CREATE ROLE semantic_owner NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'semantic_reader') THEN
    CREATE ROLE semantic_reader NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "semantic" AUTHORIZATION semantic_owner;
--> statement-breakpoint
REVOKE ALL ON SCHEMA "semantic" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "semantic" TO semantic_reader;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE semantic_owner IN SCHEMA "semantic"
  GRANT SELECT ON TABLES TO semantic_reader;
