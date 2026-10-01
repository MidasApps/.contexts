# 0043. Staff operations endpoints: workflow runs, schedules, connectors and local logs

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/contracts/src/contracts/platform/admin-operations*.ts`, `app/packages/services/src/services/platform` (operations gateway, handlers, log lines), `app/packages/services/src/services/shared/observability/{log-buffer,process-logger}.ts`, `app/packages/agents/src/console/operations-console.ts`, `app/apps/web/src/app/v1/admin/{workflow-runs,schedules,connectors,logs}` (local decision; the framework is unchanged)
- **Records:** SP5 spec §6 rows `/admin/workflows`, `/admin/connectors`, `/admin/logs`; plan Task 13
- **Relates to:** decisions 0002 (process log context), 0027 (connectors), 0037 (schedules), 0040 (console routes), 0041 (admin composition)

## Context

The `/admin` pages for workflows, connectors and logs need data that no endpoint served.

- Platform staff hold `platform.*` permissions at the platform node only. A tenant endpoint
  (`/v1/workflows/runs`, `/v1/schedules`, `/v1/organizations/{id}/connectors`) authorizes a
  `core.*` permission at the organization, so it refuses staff who are not members.
- Runs and schedules live in Mastra storage. The tenant routes read them with the caller's
  Bearer and never show platform rows.
- Log lines go to the process output. Outside local, Cloud Logging keeps them.

## Decision

1. **Runs and schedules through the runtime console routes** (the pattern of decision 0040).
   - `packages/agents/src/console/operations-console.ts` adds `GET /console/workflow-runs`,
     `POST /console/workflow-runs/:runId/cancel`, `GET /console/schedules` and
     `POST /console/schedules/:scheduleId/{pause,resume,run}`. They carry no user Bearer (Cloud
     Run IAM outside local), like every `/console/*` route.
   - Without `tenantId` they read every tenant and the platform rows. A platform run has no
     tenant resource, and a platform schedule has no `metadata.tenantId`; both show
     `tenantId: null`.
   - Cancel and the schedule actions answer the affected row, so `/v1/admin` can audit with its
     tenant.
   - Run-now of a tenant schedule still starts the run with the creator's context, and the first
     step re-authorizes that creator (decision 0037). Staff do not run as the tenant.
   - The list scans storage with the same bounds as the tenant list (10 pages of 200).
2. **`/v1/admin` handlers** (`buildAdminOperationsRoutes`, `buildAdminLogsRoutes`).
   - Each one calls `requireStaff` first: `platform.workflow.manage` for runs and schedules,
     `platform.connector.read` for connectors, `platform.trace.read` for logs.
   - Cancel, pause, resume and run-now write the platform audit log (`WORKFLOW_RUN_CANCELED`,
     `SCHEDULE_PAUSED`, `SCHEDULE_RESUMED`, `SCHEDULE_RUN_REQUESTED`) with `targetTenantId` when
     the row belongs to a tenant.
3. **Connectors are read only and per organization.** `GET /v1/admin/connectors` requires
   `organizationId` (400 `VALIDATION_FAILED` without it). The repository and its index list by
   tenant; a cross-tenant list would need its own index. There is no staff write: the only
   platform connector permission is `platform.connector.read`.
4. **Local log ring.** `GET /v1/admin/logs` exists in `APP_ENV=local` only; elsewhere it answers
   404 and the console links to Cloud Logging.
   - `configureProcessLogger` enables a ring of the last 500 records when the environment is
     `local`. The process logger hands every record to the ring after its sink.
   - The ring lives on `globalThis` under a registered symbol, for the reason of decision 0002:
     the bundler gives the instrumentation hook and the route handlers separate module instances.
   - The endpoint filters by minimum level, message text, trace and request, newest first, and
     cuts `err.stack` at 2 000 characters. Nothing else is redacted: log fields carry no PII by
     rule.
   - Only the web process is read. Mastra's lines stay in its own output.

## Consequences

- `/admin/workflows` can cancel a suspended run and pause, resume or fire any schedule.
- A staff cancel does not settle the approval request a suspended run waits for. That request
  expires through the sweep.
- Listing runs of a large deployment is bounded by the scan, as for tenants.
- The log ring holds up to 500 records in memory in local development only.

## Alternatives rejected

- **Give staff tenant permissions.** It would turn every tenant endpoint into a staff endpoint
  and bypass the platform audit log.
- **Call Mastra's built-in workflow and schedule routes.** They are closed in the allowlist, and
  they act with the caller's resource.
- **A cross-tenant connector list.** It needs a new index and the page shows one organization at
  a time anyway.
- **Mastra log lines through a new console route.** It doubles the buffer for little value in
  local, where the runtime's output is on the terminal. It is a follow-up.
