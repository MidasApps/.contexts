-- Agent runs isolation (decision 0066): FORCE applies the row level security policy of 0012 to the
-- table owner too, and the runtime role of 0007 gets only what the ledger needs: SELECT and INSERT
-- (append-only, like usage.llm_calls). Expand-only: nothing existing changes.
-- Idempotent. Rollback: REVOKE SELECT, INSERT ON "usage"."agent_runs" FROM usage_runtime;
-- DROP TABLE "usage"."agent_runs" after reverting the code of decision 0066 (the exporter and the
-- overview read and write it).
ALTER TABLE "usage"."agent_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "usage"."agent_runs" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON "usage"."agent_runs" TO usage_runtime;
