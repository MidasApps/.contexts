# 0048. Console data honesty: unmeasured numbers, cut lists and experiments read by id

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/contracts` (`AdminOverview`, observability endpoints),
  `app/packages/services` (observability routes, console gateway), `app/packages/agents` (console
  routes), `app/packages/client` (`/admin`, `/admin/costs`, `/admin/evals`, `/settings/evals`,
  `/settings/approvals`, `/admin/agents/*/prompts`)
- **Refines:** decision 0040 (traces, evals and feedback), decision 0042 (admin console UI),
  decision 0044 (admin console gaps)
- **Source:** UX review 2026-10-01, batch B6 (U-12, U-13, U-14, U-32, U-51)

## Context

The UX review found screens that state more than the data supports:

- the overview shows the guardrail stop rate as "0 %" although tripwires are never persisted
  (follow-up 57), a false all-clear;
- `/admin/costs` counts organizations at or over their cap from a list the client reads whole with
  a cap of 20 pages × 100 (`collectAllPages`), with nothing on screen when the cap cut it;
- the approvals inbox reads at most 3 × 100 requests of every status and splits them into tabs, so
  pending requests can disappear silently while the history grows without bound;
- an experiment can only be compared with one on the same list page, because the comparison
  resolves the chosen ids inside the page; `/admin/evals` even dropped the comparison on paging.

## Decision

1. **Unmeasured numbers are named by the API.** `AdminOverview` gains `unmeasured`, a list of the
   numbers that hold a placeholder (today `["tripwireRate"]`). It is additive (default `[]` for an
   answer without it). The card shows "Não medido" and why instead of the value. When tripwires are
   persisted (follow-up 57) the overview computes the rate and drops it from the list.
2. **Whole-list reads say when they were cut.** `collectPages` returns `{ items, truncated }`
   (`truncated` = the page cap stopped the read with a next page announced); `collectAllPages`
   keeps returning the items for pickers, where a cut list only misses options. Views that count,
   total or alert from such a list show a warning above the numbers (`/admin/costs`, the pending
   approvals).
3. **The approvals inbox reads what each tab needs.** "Aguardando minha decisão" and "Pedidas por
   mim" come from one read of the pending requests (`?status=pending`, server filter, polled every
   15 s); "Pedidas por mim" therefore lists the viewer's pending requests, the decided ones are in
   the history. The history is a cursor list of 20 per page read when its tab opens; the API filters
   one status at a time, so it lists every request and drops the pending ones on the client.
4. **One experiment by id.** `GET /v1/evals/experiments/{experimentId}?organizationId=`
   (`core.eval.read`, tenant scoped) and `GET /v1/admin/experiments/{experimentId}` (staff,
   `platform.eval.manage`). The runtime route `GET /console/experiments/:experimentId` reads Mastra
   storage with `getExperimentById` and the tenant filter, and checks the owner again, so another
   tenant's experiment answers 404 like a missing one. The console resolves a chosen experiment from
   the shown page or, failing that, by id; the comparison survives paging (the admin keeps `?a=&b=`
   in the URL) and sits above the list, next to the "Comparar" toggles, with loading, not found and
   failed reads told apart.
5. **Append-only lists are paged.** Prompt versions and activations (answered whole by the API) are
   shown 20 per page; the diff still resolves any version.

## Consequences

- A screen never shows a placeholder or a partial count as a measurement; the cost of an extra read
  is one `GET` per chosen experiment that is not on the shown page.
- The overview total of `/admin/costs` stays exact (computed by the API); only the list-derived
  numbers carry the warning. Serving the alert and over-cap counts from the API is the long-term fix.
- The approvals history no longer refetches every 15 s; a decision invalidates every list of the
  organization, so it shows up there.

## Alternatives

- **Drop the tripwire card until it is measured.** Hides that the platform does not measure it yet.
- **`?ids=` on the list endpoints.** Mastra storage reads by id directly; a list filter would mix
  paging and lookup in one contract.
- **Raise the page cap.** Moves the cliff, does not tell anyone they fell off it.
