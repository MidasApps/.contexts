# 0061. Schedule fire preview from the server, and the runs page in the URL

- **Status:** accepted
- **Date:** 2026-10-03
- **Scope:** `app/packages/contracts/src/contracts/workflows/{schedule.schema.ts,endpoints.ts}`, `app/packages/agents/src/workflows/schedules/{schedule-policy.ts,tenant-schedule-routes.ts}`, `app/packages/services/src/services/workflows` (gateway port, Mastra adapter, `/v1/schedules` handler), `app/apps/web/src/app/v1/schedules/preview`, `app/packages/client/src/{entities/schedule,features/schedule-editor,widgets/schedule-table,shared/lib/pagination,views/settings-workflows}` (local decision; the framework is unchanged)
- **Records:** follow-up #64; SP5 plan Task 14 (schedule editor: "next 5 fires shown in schedule zone and viewer zone")
- **Relates to:** decisions 0037 (workflow schedules), 0045 (tenant settings pages)

## Context

The SP5 plan asks the schedule editor to show the next five fires in the schedule's zone and the
viewer's. The client has no cron library and should not get one: a second engine could disagree
with the scheduler on DST or day-of-week rules. The server already computes fires with Mastra's
helpers over Croner, the engine that fires the schedule (`schedule-policy.ts`, `nextFires`). The
editor must preview a cron that is not saved yet, so a field on `Schedule` alone would not do: it
would show the saved cron's fires while the person edits another one. In `/settings`, the editor
in edit mode is the schedule's detail; there is no separate detail page.

The workflows page already kept its tab and run filters in the URL, and the traces page its filters
and page (commits 948f9335 and 2a3eeb41). The runs list still kept its page in component state.

## Decision

1. **`POST /v1/schedules/preview?organizationId=`** (`schedules.preview`, `core.schedule.read`)
   takes `workflows.SchedulePreviewInput` (`{ cron, timezone }`, the same cron and zone schemas
   as a write) and answers `{ data: workflows.SchedulePreview }` (`{ nextFireTimes: string[] }`,
   at most `SCHEDULE_PREVIEW_FIRES` = 5 ISO instants in UTC, from now). It is additive: no existing
   contract changes. POST because the input is a body, not an id; the path is a static segment,
   and no `POST /v1/schedules/{scheduleId}` exists for it to collide with.
2. **The runtime computes it.** `/v1` calls the custom route `POST /tenant-schedules/preview` with
   the caller's Bearer, like the other schedule routes. The route authorizes `core.schedule.read`
   again, validates the body, and runs `previewFires` (Croner's `validateCron`, then `nextFires`).
   A cron Croner cannot read is `400 VALIDATION_FAILED` on `cron` (`INVALID_CRON`). The minimum
   interval is not applied: it is a write rule, and the save still refuses with its own code.
3. **The editor shows the preview.** `NextFires` asks for the draft's cron and zone as soon as the
   cron is complete (TanStack Query, keyed by organization, cron and zone; the previous fires stay
   while the next load) and lists five fires with `FireTime`, the schedule table's former `Fire`
   cell now shared by the feature: the schedule's zone, and the viewer's when it differs. A failed
   preview is a quiet line, not an alert; saving still validates.
4. **The runs page joins the URL.** `useCursorPages` takes an optional external page state;
   `RunsSection` passes `useSettingsSearch`'s `page`/`setPage`, so `?page=` sits next to
   `workflowId` and `status` and a filter change returns to page 1. Cursors stay opaque
   (contracts/api.md §9): a link to page N loads the cursors before it, one at a time.

## Consequences

- The editor and the scheduler can never disagree about the next fires; the client bundle gains no
  cron code.
- Each completed cron edit costs one round trip to the runtime (cached a minute per cron and zone).
- A shared runs link to a deep page fetches every page before it; pages are 20 runs, so this stays
  small for any page a person would share.
- The schedule table still shows only the next fire; its five fires are one edit dialog away.

## Alternatives rejected

- **A cron library in the client.** A second engine, a heavier bundle, and DST rules that could
  drift from Croner.
- **`nextFireTimes` on `Schedule`.** It cannot preview an unsaved cron, which is what the editor
  needs; it would also compute five fires per schedule on every list.
- **The cursor itself in the URL.** "Previous" would need a stack of cursors in the URL, and a
  cursor is opaque and may expire; a page number over cached pages is enough.
