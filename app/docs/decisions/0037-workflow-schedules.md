# 0037. Workflow schedules with time zones

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/agents/src/workflows`, `app/packages/services/src/services/workflows`, `app/apps/mastra` (local decision; the framework is unchanged)
- **Records:** SP5 spec D5-02 (§3.5); umbrella §6 (time zones), §16.3 (scheduler host)

## Context

Platform jobs (usage report, approval sweep, purge, reindex, eval export) and tenant jobs need
cron schedules. Mastra 1.71 ships Schedules: declarative on `createWorkflow`, and at runtime
through `mastra.schedules.*`. They use Croner, and the time zone defaults to the host's.

## Decision

**D5-02.**

- Mastra Schedules is the only scheduler: one per deployment, on the long-lived Mastra host
  (`min-instances ≥ 1`, CPU always allocated). `MASTRA_WORKERS` stays unset. Missed fires are not
  replayed, so jobs are idempotent and catch up on the next fire.
- Platform schedules are declarative on the core workflows and always in `UTC`.
- Tenant schedules go through `/v1/schedules` (`core.schedule.read|write`) to
  `mastra.schedules.create`, with id `schedule_<tenantId>_<slug>`, `resourceId = tenantId:uid`,
  `metadata { tenantId, createdBy }` and a request context built from the creator.
  - Only workflows flagged `schedulable: true` in their `AgentModule` entry can be scheduled.
  - `timezone` is required and must be an IANA zone.
  - `cron` has exactly 5 fields.
  - The minimum interval is 15 min (`SCHEDULE_MIN_INTERVAL_MINUTES`; down to 1 only with
    `APP_ENV=local`), checked with Croner's next dates.
  - The workflow's input schema validates `inputData`, through the gateway.
- Every run re-authorizes the creator in its first step. When the creator lost access, the run
  fails `FORBIDDEN` and the schedule is paused with a notification.

## Consequences

- A tenant schedule never runs with more rights than its creator has today.
- Croner handles DST in the schedule's zone. The UI shows the next fires in the schedule's zone
  and in the viewer's zone.

## Alternatives rejected

- **Cloud Scheduler + Functions.** A second scheduler, and workflow state split across hosts.
- **Agent schedules (`agentId` + prompt).** Unattended agent loops; scheduled work is a workflow.

## Amendments

- **A1 — 2026-09-30 (SP5 Task 5): schedule ids, platform schedules and where the policy runs.**
  - **Ids.** Mastra slugifies schedule ids (lowercase; `_` and case changes become `-`), so a raw
    tenant id does not survive. A tenant schedule id is `schedule_<tenant key>-<slug>`, the tenant key
    being the first 16 hex digits of SHA-256(tenantId). Ownership never comes from the id: it is
    `metadata.tenantId`, written only by the runtime from the verified context.
  - **Platform schedules are rows written at boot, not `createWorkflow({ schedule })`.** A declarative
    schedule moves the workflow to Mastra's evented engine, which the core workflows do not use (they
    run in process and in tests on the default engine). `ensurePlatformSchedules` creates or realigns
    `schedule_platform-<workflowId>` rows in UTC, with no principal and no tenant metadata, and keeps
    a row an operator paused paused. Measured on Postgres: a `* * * * *` tenant schedule fires on its
    own on the default engine (scheduler tick 500 ms in the test, 10 s by default).
  - **The policy runs in the runtime.** Tenant schedules are written through custom Mastra routes
    (`/tenant-schedules/*`, behind the context middleware), which check `core.schedule.write`, the
    `schedulable` flag, the workflow's input schema and the interval with Mastra's own Croner helpers
    (`computeNextFireAt`, `validateCron`); no separate `croner` dependency. `/v1/schedules` authorizes
    first and forwards the caller's Bearer. The raw `/api/schedules` routes are closed: a raw schedule
    can carry any request context.
  - **Notices.** The `NotificationPort` is bound to a structured log line (`workflow_notification`)
    until a delivery channel exists.
- **A2 — 2026-10-01 (backend fixes): the `workflows.schedules` flag holds every fire.**
  - The runtime wraps the `schedules` storage domain it hands to Mastra (`gateScheduleFires`): while
    the flag is off for the environment, `listDueSchedules` returns nothing, so the scheduler fires
    no tenant **and no platform** schedule (`approval-expiry-sweep`, `conversation-purge`,
    `usage-report`, `eval-export`, `catalog-reindex`) on any instance. Unlike `ai.kill-switch`, which
    leaves workflows alone, this is the switch for workflows.
  - Rows, their `paused` state and `nextFireAt` are untouched, and creating, editing, pausing and
    run-now keep working. When the flag is on again, each missed schedule fires **once** on the next
    tick and Mastra computes the next fire from then: there is no backfill.
  - The flag is read through the 30 s flag cache with fallback `true` (a store failure keeps firing:
    the platform crons expire approvals and purge data). Each pause and resume is logged
    (`schedule_fires_paused`, `schedule_fires_resumed`).
  - Rejected: stopping `mastra.scheduler` from a watcher (Mastra restarts it lazily when a schedule
    is created) and a guard step in each workflow (it would still claim fires and record runs).
