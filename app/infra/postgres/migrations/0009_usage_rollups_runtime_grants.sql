-- Usage rollups, budget alerts and export cursors (SP5 Task 6, decisions 0026 and 0039): FORCE
-- applies the row level security policies of 0008 to the table owner too, and the runtime role of
-- 0007 gets only what the usage-report workflow needs. Expand-only: nothing existing changes.
-- usage_runtime: SELECT/INSERT/UPDATE on rollups and cursors (idempotent upserts), SELECT/INSERT on
-- budget alerts (append-only: an alert row is the "sent once" marker).
-- Idempotent. Rollback: REVOKE the grants below; DROP TABLE "usage"."daily_rollups",
-- "usage"."budget_alerts", "usage"."export_cursors" (they are derived data: rerunning
-- usage-report rebuilds rollups; dropping alerts may re-send this month's alerts).
ALTER TABLE "usage"."daily_rollups" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage"."budget_alerts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage"."export_cursors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "usage"."daily_rollups", "usage"."budget_alerts", "usage"."export_cursors" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "usage"."daily_rollups" TO usage_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON "usage"."budget_alerts" TO usage_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "usage"."export_cursors" TO usage_runtime;
