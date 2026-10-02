# B6: Admin data honesty and evals compare fixes

Batch B6 of `consolidated.md`: U-12, U-13, U-14, U-32, U-51. Every finding still held when
re-checked on `01d374ca` (`AdminKpiCards.tsx` rendered `percent(overview.tripwireRate)`,
`AdminCostsView` read `useAllAdminOrganizations` with no cut indicator, `setPage` cleared `a`/`b`,
`APPROVALS_MAX_PAGES = 3` with no notice, prompt tables had no `pagination`). Decision:
`app/docs/decisions/0049-console-data-honesty-and-experiment-by-id.md`.

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-12 contract | ADM-02 | fixed | `feat(contracts): name the admin overview numbers not measured yet` | `contracts/platform/platform.schema.test.ts` "names the numbers that are not measured, none when an older answer omits the list"; `services/platform/.../get-admin-overview.test.ts` "keeps the tripwire rate at 0 and says it is not measured…" |
| U-12 card | ADM-02 | fixed | `fix(admin): show the guardrail stop rate as not measured` | `views/admin-overview/ui/AdminOverviewView.test.tsx` "says a number is not measured instead of showing its placeholder value" |
| U-13 cut indicator | ADM-03 | fixed | `feat(client): report when a whole-list read hits the page cap`; `fix(admin): make the costs page honest about what it counts` | `shared/api/cursor-list.test.ts` (4 cases: whole, cut, last page allowed is last, `collectAllPages` items only); `views/admin-costs/ui/AdminCostsView.test.tsx` "warns that the counts, the alerts and the budgets cover only the organizations read when the list is capped", "does not warn when every page was read" |
| U-14 server read by id | ADM-04 | fixed | `feat(contracts): read one eval experiment by id`; `feat(agents): serve one experiment by id on the console routes`; `feat(services): answer one eval experiment by id`; `test(agents): expect the experiment by id route in the runtime` | `agents/console/console-storage.test.ts` "reads one experiment by id: staff any, a tenant only its own", "never answers another tenant's experiment even when the store ignores the filter"; `services/.../mastra-traces-reader.test.ts`; `services/.../observability-routes.test.ts` "reads a tenant's experiment under the caller's organization only", "lets staff read any experiment and refuses a tenant admin" |
| U-14 admin compare across pages | ADM-04 | fixed | `fix(admin): compare eval experiments across list pages` | `entities/eval-experiment/model/use-experiment-pair.test.ts` (3 cases); `views/admin-evals/ui/AdminEvalsView.test.tsx` "compares with an experiment of another page, read by id", "pages experiments by number and keeps the comparison across pages", "shows a failed read of a chosen experiment with its reference and a retry" |
| U-14 settings compare placement | S-p9 | fixed | same | `views/settings-evals/ui/SettingsEvalsView.test.tsx` "compares two experiments chosen on the page, shown above the list", "keeps a chosen experiment across pages and reads it by id for the organization" |
| U-32 approvals cap | S-m9 | fixed | `fix(access): stop the approvals inbox from silently dropping requests` | `views/settings-approvals/ui/SettingsApprovalsView.test.tsx` "says when the pending requests were cut at the read limit", "pages the history by cursor instead of reading it whole", "shows my own pending requests without decision controls and the settled ones in the history" |
| U-32 prompt versions / activations | ADM-21 | fixed | `fix(admin): page prompt versions and activation history` | `views/admin-agent-prompts/ui/AdminAgentPromptsView.test.tsx` "pages long version and activation lists, twenty rows at a time" |
| U-51 | ADM-17 | fixed | `fix(admin): make the costs page honest about what it counts` | `views/admin-costs/ui/AdminCostsView.test.tsx` "puts the organizations that need attention right under the numbers, ten at most, with a way to see them all" |

## What changed

- `AdminOverview.unmeasured` (additive, default `[]`) lists placeholder numbers; the overview
  answers `["tripwireRate"]` until follow-up 57 persists guardrail stops. The KPI card says
  "Não medido" with a hint instead of "0 %".
- `collectPages` returns `{ items, truncated }`; `/admin/costs` shows a warning above the KPIs
  when the 20 × 100 read was cut. The attention list moved right under the KPIs, capped at 10 rows,
  with "ver todos" setting `?level=alert` on the budgets table and scrolling to it.
- `GET /v1/evals/experiments/{experimentId}?organizationId=` (`core.eval.read`) and
  `GET /v1/admin/experiments/{experimentId}` (`platform.eval.manage`), backed by
  `GET /console/experiments/:experimentId` with the tenant filter and an owner re-check (other
  tenant = 404). `ExperimentComparisonPanel` (widget) resolves a chosen experiment from the page or
  by id, sits above the list in both consoles and tells loading, not found and failed apart; the
  admin keeps `?a=&b=` across pages.
- Approvals: pending requests read with `?status=pending` (polled) plus a notice when the cap cut
  them; the history is a 20-per-page cursor list read when its tab opens.
- Prompt versions and activations page 20 rows at a time.

## Still open (not part of this batch)

- Follow-up 57 (persist tripwires, then compute the rate) stays open; the UI is now honest about it.
- Serving the alert / over-cap counts from the API instead of the capped list is the long-term fix
  noted in decision 0049; the warning covers the gap today.
