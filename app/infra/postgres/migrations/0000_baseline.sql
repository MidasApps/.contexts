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
  -- `AUTHORIZATION semantic_owner` and `ALTER DEFAULT PRIVILEGES FOR ROLE
  -- semantic_owner` need the migrating role to be able to SET ROLE to it. On
  -- Cloud SQL (PG16+) the creator only gets ADMIN OPTION, not membership, so
  -- grant it (SET only, no inherited rights). Superusers already pass the check.
  IF NOT pg_has_role(current_user, 'semantic_owner', 'SET') THEN
    EXECUTE format('GRANT semantic_owner TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "semantic" AUTHORIZATION semantic_owner;
--> statement-breakpoint
-- Schema grants need the owner's rights, which a non-superuser migrator only
-- has through SET ROLE; RESET keeps the rest of the migration run as itself.
SET ROLE semantic_owner;
--> statement-breakpoint
REVOKE ALL ON SCHEMA "semantic" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "semantic" TO semantic_reader;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE semantic_owner IN SCHEMA "semantic"
  GRANT SELECT ON TABLES TO semantic_reader;
--> statement-breakpoint
RESET ROLE;
