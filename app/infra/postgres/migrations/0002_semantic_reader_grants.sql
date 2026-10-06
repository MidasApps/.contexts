-- Semantic SQL runner privileges (decision 0024, SP3 Task 11). The runtime runs
-- AI queries as `SET LOCAL ROLE semantic_reader` inside a read-only transaction.
-- mastra_runtime may switch to semantic_reader (SET) but does not inherit its
-- rights, so plain runtime queries never see the semantic views; semantic_reader
-- keeps only USAGE on the schema and SELECT on views. Idempotent.
-- Rollback: REVOKE semantic_reader FROM mastra_runtime (views keep their grants).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'mastra_runtime')
     AND NOT pg_has_role('mastra_runtime', 'semantic_reader', 'SET') THEN
    GRANT semantic_reader TO mastra_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
END
$$;
--> statement-breakpoint
SET ROLE semantic_owner;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA "semantic" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA "semantic" FROM mastra_runtime;
--> statement-breakpoint
REVOKE ALL ON SCHEMA "semantic" FROM mastra_runtime;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA "semantic" FROM semantic_reader;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA "semantic" TO semantic_reader;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "semantic" FROM semantic_reader;
--> statement-breakpoint
RESET ROLE;
