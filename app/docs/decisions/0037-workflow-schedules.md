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
