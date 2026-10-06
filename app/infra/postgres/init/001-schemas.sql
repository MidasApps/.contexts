-- Local bootstrap only (runs once on an empty volume). Remote databases get the
-- same objects from versioned migrations; this file must stay idempotent.

-- pgvector lives in public; vector tables live in `ai` (contracts/pgvector.md §1).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Mastra storage (memory, threads, workflow snapshots).
CREATE SCHEMA IF NOT EXISTS mastra;
-- Embeddings, chunks and retrieval metadata.
CREATE SCHEMA IF NOT EXISTS ai;

-- Read-only views for the AI SQL tool (spec §16.4). The owner cannot log in and
-- does not bypass RLS, so views run with its rights under the base tables'
-- FORCE ROW LEVEL SECURITY; the reader only gets USAGE plus SELECT on views.
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

CREATE SCHEMA IF NOT EXISTS semantic AUTHORIZATION semantic_owner;
REVOKE ALL ON SCHEMA semantic FROM PUBLIC;
GRANT USAGE ON SCHEMA semantic TO semantic_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE semantic_owner IN SCHEMA semantic
  GRANT SELECT ON TABLES TO semantic_reader;
