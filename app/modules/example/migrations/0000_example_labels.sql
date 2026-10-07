-- Labels of the example module (decision 0077): the template of a module's first Postgres table.
-- Schema named after the module id; row level security enabled and forced on app.tenant_id, so the
-- policy applies to the table owner too; example_runtime is NOLOGIN and NOBYPASSRLS, has DML on
-- the table and no CREATE on the schema. The web and Mastra login roles may switch to it (SET)
-- without inheriting its rights. Idempotent. Rollback: DROP SCHEMA example CASCADE;
-- REVOKE example_runtime FROM mastra_runtime, web_runtime; DROP ROLE example_runtime.
CREATE SCHEMA IF NOT EXISTS "example";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "example"."labels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "labels_tenant_id_name_key" UNIQUE("tenant_id","name"),
	CONSTRAINT "labels_name_check" CHECK (length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "example"."labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "example"."labels" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "labels_tenant_isolation" ON "example"."labels";
--> statement-breakpoint
CREATE POLICY "labels_tenant_isolation" ON "example"."labels"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'example_runtime') THEN
    CREATE ROLE example_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'mastra_runtime')
     AND NOT pg_has_role('mastra_runtime', 'example_runtime', 'SET') THEN
    GRANT example_runtime TO mastra_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_runtime')
     AND NOT pg_has_role('web_runtime', 'example_runtime', 'SET') THEN
    GRANT example_runtime TO web_runtime WITH INHERIT FALSE, SET TRUE;
  END IF;
  -- A non-superuser migrator (Cloud SQL) must be able to SET ROLE for the Postgres tests.
  IF NOT pg_has_role(current_user, 'example_runtime', 'SET') THEN
    EXECUTE format('GRANT example_runtime TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON "example"."labels" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "example" TO example_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "example"."labels" TO example_runtime;
