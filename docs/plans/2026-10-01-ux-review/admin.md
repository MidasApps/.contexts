# UX review — staff console (`/admin`)

Scope: `views/admin-*` (15 views: slot, overview, organizations, organization detail, plans,
users, agents, agent prompts, costs, flags, traces, trace detail, evals, workflows, connectors,
logs), `widgets/admin-*` (nav/page frame/query section/org filter, sidebar, KPI cards, prompt
diff), the shared widgets used there (`trace-viewer`, `cost-charts`, `run-timeline`,
`schedule-table`, `experiment-compare`, `impersonation-banner`), `features/admin-*` (11 slices)
and `entities/admin-*` (5 slices), plus `app-shell/admin-layout.tsx` and the `/admin` items of
`app-shell/navigation/core-navigation.ts`. All paths below are under `app/packages/client/src/`
unless stated otherwise.

## Method and limits

- Read-only review by code reading of every file in scope; colocated tests were skimmed for the
  states they assert.
- Component tests of the scope were run:
  `pnpm -C app/packages/client exec vitest run src/views/admin- src/widgets/admin- src/widgets/trace-viewer src/widgets/cost-charts --maxWorkers=2`
  → **22 files, 205 tests passed** (99 s).
- No browser was started and no screenshots were taken (machine memory). Each finding is tagged
  **[seen]** (follows directly from the code cited) or **[inferred]** (a layout/runtime consequence
  deduced from CSS or flow; worth one screenshot or e2e to confirm).
- Not verified, so not claimed: rendered contrast ratios, real layouts at 360/768/1280 px, dark
  theme rendering. What was verified by grep: no hex/`rgb()`/raw Tailwind palette colors in scope
  (all colors are tokens); `--destructive-text` used by every inline error is defined for both
  themes (`shared/ui/styles/globals.css:54`, `:104`, `:167`); a global `:focus-visible` outline
  exists (`globals.css:234`) and a global `prefers-reduced-motion` rule (`globals.css:241`).
- i18n: `admin.json` has the same **810 keys** in pt-BR, en-US and es-419 (scripted diff); no
  Portuguese-only text in es-419 and no accented text in en-US; the only `{count}` without ICU
  `plural` is `costs.usage.truncatedDescription`, whose count is always at the 2 000 limit, so not
  a defect. No hard-coded copy or literal `aria-label` found in scope.
- Items already recorded in `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` are marked
  **known (#N)** and are only reported where the UI adds a problem of its own.

## Summary

| Screen / block / component | States covered (seen in code + tests) | Missing / weak | Verdict |
|---|---|---|---|
| `AdminLayout` + `AdminSidebar` + topbar | permissions skeleton in sidebar, retry on error, active item, collapse to icons, phone sheet closes on navigation, offline banner | 11 flat items (ADM-33), duplicate Staff badge (ADM-34) | Good |
| `AdminPageFrame` / `AdminQuerySection` (frame of every page) | one `h1`, back link on details, permission skeleton, error + reference + retry, 403 no-access, 403 `MFA_REQUIRED` with action | actions mount late → header shift (ADM-18) | Good |
| `AdminOrganizationFilter` | searchable by name/id, loading placeholder, keeps an unknown id of a shared link, "all" option | list capped at 2 000, known (#52) | Good |
| `useAdminSearch` (URL state) | filters/page in URL (replace), chained writes, page reset on filter change | impersonation scope not in URL (ADM-08) | Good |
| `AdminSlotView` (`/admin/<area>` placeholder) | me loading, unknown area → 404, empty state + back | uses `PageHeader`, not the admin frame (ADM-36) | Good |
| `AdminOverviewView` + `AdminKpiCards` | KPI skeleton, KPI error isolated from areas, no areas empty, verdict pill with icon + words, locale numbers/percent/money | tripwire rate shown as measured (ADM-02); KPIs not links (ADM-29) | Needs fix |
| `AdminOrganizationsView` | server search debounced + in URL, status filter, cursor pages, skeleton, error, no-match + clear, empty + action, phone cards, budget pills | empty action leaves the console (ADM-35) | Good |
| `AdminOrganizationDetailView` + `admin-update-organization` (plan, budget, status) | 404, read-only note without update permission, toasts, inline errors, pending, offline-disabled, confirm for suspend/clear override | budget form submit-when-unchanged / sticky errors (ADM-22); related links miss connectors/workflows (ADM-24) | Good |
| `AdminPlansView` + `PlanFormDialog` | skeleton, error, empty + create, edit per row, offline-disabled, SchemaForm field errors, toast, blast-radius copy | dialog discards edits on Esc (ADM-01, second half); free-text feature keys (ADM-23) | Good |
| `AdminUsersView` (search, current session, start, all sessions) + `admin-impersonation` | idle state, submit-only search (no PII in URL), cursor pages, no-match, disabled users not selectable, per-field errors, 403/404 explained, toasts, end confirm, expiry tick | raw uid for the current session (ADM-06); no focus hand-off (ADM-07); org error not linked (ADM-09) | Needs fix |
| `ImpersonationBanner` + `LeaveImpersonationButton` | live region, read-only + audit copy, expiry when known, pending, fail-safe sign-out | banner does not name user/org (ADM-06) | Good |
| `AdminAgentsView` + `AgentCatalogSection` | catalog skeleton/error/empty + reload, role pills, organization chosen in URL, empty + open picker | — | Good |
| `AgentEnablementPanel` | optimistic switch with rollback, all controls locked while saving, error + reference, offline note, toasts | PII guardrail weakened without confirm (ADM-05); raw key as hint (ADM-30) | Needs fix |
| `AdminAgentPromptsView` (+ versions table, eval outcome, diff, history, activation & editor dialogs) | 404 for non-prompt agents, eval running/failed/result, activation gated with reason, rollback wording, forced path with required reason, diff in URL, empty + create | editor loses text on Esc (ADM-01); Compare gives no feedback (ADM-20); unpaginated lists (ADM-21); raw experiment id (ADM-31); empty seed known (#86) | Needs fix |
| `PromptDiff` | pick both, identical, +/− marks + sr labels, focusable scroll region | — | Good |
| `AdminCostsView` + `CostCharts` + `UsageBreakdown` | skeleton, error, empty + action, level filter in URL with numbered pages, usage range in URL, invalid range guard, truncated warning, unpriced note, chart + table | totals from a capped list with no indicator (ADM-03); action list buried/unpaged (ADM-17); model table scrolls on phones (ADM-13); invalid range UX (ADM-14) | Needs fix |
| `AdminFlagsView` + `SetFlagDialog` / `ClearFlagOverrideDialog` | expired alert, environment switch behind confirm (kill-switch destructive), per-org override set/clear, override load error + retry, offline-disabled | long expired list in one sentence, no filter (ADM-25); English descriptions known (#85) | Good |
| `AdminTracesView` + `TraceFilters` | filters in URL, invalid URL values ignored, agent format error, numbered pages, no-match + clear, empty, phone cards | row lacks wrap (ADM-16); date-zone semantics (ADM-15) | Good |
| `AdminTraceDetailView` + `TraceViewer` | invalid id/404 → not found, summary cards, span tree collapsible, payload closed by default and focusable, empty spans, link to logs | minute-precision times (ADM-19) | Good |
| `AdminEvalsView` (experiments, datasets) + `ExperimentCompare` | tabs/page/A-B in URL, skeleton, error, empty + cross-tab action, compare hints, stale selection warning, verdict pills | comparison limited to one page (ADM-04); ids as only label (ADM-12); no refresh of running (ADM-10) | Needs fix |
| `AdminWorkflowsView` (runs, schedules) + `RunTimeline` + `ScheduleTable` + `CancelRunDialog` / schedule dialogs | tabs + filters in URL, suspended-only toggle, cursor pages, no-match/empty, cancel (destructive, suspended warning), pause/resume/run-now confirmations (platform pause destructive), zone-aware fire times | no auto-refresh (ADM-10); details not linkable (ADM-11); machine names/raw ids (ADM-26); raw cron (ADM-32) | Needs fix |
| `AdminConnectorsView` | org required, choose state, read-only notice, cursor pages, empty | empty action is a dead end (ADM-24); read only known (#47) | Good |
| `AdminLogsView` + `LogFiltersForm` + `LogLines` | level at once, text on submit, refresh pending, remote → Cloud Logging, no-match + clear, empty + refresh, trace links | minute precision (ADM-19); local only known (#48) | Good |
| `ConfirmDialog` (kit, used by every admin write) | pending, no double submit, focus return, inline error | confirm not offline-aware (ADM-27) | Good |
| `entities/admin-*` (organization, overview, usage, user, agent) | pills in words, 80 % alert/over levels, name resolver falling back to id, batched name lookup | — | Good |
| Tests | 22 view/widget test files pass; e2e journeys exist (`apps/web/e2e/admin-*.spec.ts`, 8 specs) | no colocated tests for `features/admin-*` and 6 widgets (ADM-28) | — |

## Findings

### Major

**ADM-01 — Prompt editor (and plan form) discard unsaved text on Escape or outside click**
- Area: UX / destructive action · [seen]
- File: `features/admin-prompt-version-editor/ui/PromptVersionDialog.tsx:120` (also `features/admin-update-plan/ui/PlanFormDialog.tsx:52`)
- Problem: `<Dialog open={open} onOpenChange={onOpenChange}>` closes on Esc, overlay click and the X with no dirty check; the form state (`body`, up to 50 000 chars, line 41) lives in `PromptVersionForm`, which unmounts. Same pattern in the plan dialog.
- User impact: staff editing a long platform prompt lose it with one stray Esc or click outside; there is no draft.
- Fix: lift `body`/`note` dirty state to the dialog; in `onOpenChange(false)` and `onEscapeKeyDown`/`onInteractOutside` call `event.preventDefault()` when dirty and open a `ConfirmDialog` ("Descartar alterações?"). Optionally keep a per-agent draft in `sessionStorage`. Apply the same guard to `PlanFormDialog`.

**ADM-02 — Overview shows the guardrail-stop rate as a measured number although it is never measured**
- Area: data correctness / UX · [seen] · known (#57) for the backend gap
- File: `widgets/admin-kpi-cards/ui/AdminKpiCards.tsx:58`
- Problem: `percent(overview.tripwireRate)` is rendered like every other KPI; follow-up #57 states the rate is always 0 because tripwires are not persisted.
- User impact: staff read "0 %" as "no guardrail stops", a false all-clear on the console's home.
- Fix: until #57 lands, render the card with a "não medido" value (`—` + hint key) or drop it; add an `unmeasured` flag to `AdminOverview` so the card can say so honestly afterwards.

**ADM-03 — Cost KPIs, the alert list and the budget table are computed from a capped list with no indicator**
- Area: data correctness · [seen] · scale is known (#52); the missing indicator is new
- File: `views/admin-costs/ui/AdminCostsView.tsx:230` (data), `:55-56` (KPI counts), `:66-68` (attention), `:124` (table); `entities/admin-organization/api/admin-organization-queries.ts:38-46`; `shared/api/cursor-list.ts:12-13`
- Problem: the page reads `useAllAdminOrganizations` (`collectAllPages`, 20 × 100, whose own comment says "catalogs and pickers, never tables") and counts "at alert"/"over cap" from it. Past 2 000 organizations the rest is silently dropped. `UsageBreakdown` warns on its own truncation (`UsageBreakdown.tsx:88-94`), this part does not.
- User impact: the "organizations over the cap" number and list can be wrong with nothing on screen saying so.
- Fix: have `collectAllPages` return `{ items, truncated }` (true when the last page still `hasMore`) and show the same warning Alert above the KPIs; longer term, serve the alert/over counts from the API (`GET /v1/admin/overview` already aggregates).

**ADM-04 — An experiment can only be compared with experiments on the same list page**
- Area: UX / task dead-end · [seen] · related to #45 (no server compare)
- File: `views/admin-evals/model/use-evals-url.ts:58-63`; `views/admin-evals/ui/ExperimentsPanel.tsx:66-67`, `:135`
- Problem: `setPage` clears `a`/`b`, and `Comparison` resolves the chosen ids only inside `page.data`. A shared link whose A is on another page shows the "missing" warning.
- User impact: the core question "is today's run better than last week's baseline?" cannot be answered once the baseline has scrolled off page 1.
- Fix: keep `a`/`b` across pages; fetch the chosen experiments by id (`GET /v1/admin/evals/experiments/{id}` or `?ids=`), render `ExperimentCompare` from those, and show a "Comparando A × B" bar pinned above the table with "limpar".

### Minor

**ADM-05 — Weakening an organization's PII guardrail is one radio click, with no confirmation**
- Area: destructive action / compliance · [seen]
- File: `features/admin-agent-enablement/ui/AgentEnablementPanel.tsx:98`, `:139-142`
- Problem: `onValueChange` of the PII `RadioGroup` saves `redact → warn` immediately; every flag flip on `/admin/flags` goes through `SetFlagDialog`.
- User impact: a misclick lets personal data reach the model for a whole organization until someone notices (audited, but already sent).
- Fix: route `redact → warn` (and enabling `browser`/`firecrawl`) through a `ConfirmDialog` naming the organization; keep instant save for the safe direction.

**ADM-06 — Support mode identifies the impersonated user by raw uid, and the banner names nobody**
- Area: UX / raw ids · [seen]
- File: `features/admin-impersonation/ui/OpenImpersonationSession.tsx:64`; `widgets/impersonation-banner/ui/ImpersonationBanner.tsx:51`
- Problem: the current session shows `session.targetUid` in mono, while the sessions table resolves names with `useAdminUserNames`. Inside the app the banner says "outro usuário" only.
- User impact: staff must trust an opaque id that this is the right person, and once inside cannot tell whom/which organization they are acting as.
- Fix: store `targetLabel` and `organizationName` in `StoredImpersonation` at start (the form already has `target.label`), show them in `OpenImpersonationSession`, and use `messageUntil` with `{user}`/`{organization}` in the banner.

**ADM-07 — Selecting a user does not lead to the start form, and starting does not lead to "Abrir como usuário"**
- Area: UX / focus management · [seen]
- File: `views/admin-users/ui/UserSearchSection.tsx:47`; `views/admin-users/ui/AdminUsersView.tsx:62-66`; `features/admin-impersonation/ui/StartImpersonationForm.tsx:93-95`
- Problem: "Selecionar" only flips `aria-pressed`; the start form sits two sections below. After a successful start the form clears and the session appears in the section above; focus stays on the submit button.
- User impact: on smaller screens the result of each step is off-screen; keyboard and screen-reader users get no hand-off.
- Fix: on select, `scrollIntoView` + focus the start section heading (or the reason field); on success, focus the "Abrir o app como este usuário" button of `OpenImpersonationSession`.

**ADM-08 — Impersonation sessions scope is local state, unlike every other admin filter**
- Area: URL state / consistency · [seen]
- File: `views/admin-users/ui/ImpersonationSessionsSection.tsx:178`
- Problem: `useState("active")`; reload or a shared link always returns to "open now".
- Fix: `useAdminSearch(["sessions"])` with `active` as the default.

**ADM-09 — Start-impersonation form: organization error not tied to its field, limits only revealed by the error**
- Area: forms / a11y · [seen]
- File: `features/admin-impersonation/ui/StartImpersonationForm.tsx:127-129`, `:147-158`, `:83`
- Problem: the organization `FieldMessage` is not referenced by the combobox (`aria-describedby`/`aria-invalid` cannot reach it through `organizationField`); the duration input has no hint of the 1–60 range until submit fails; errors are set on submit and stay after the value is fixed.
- Fix: pass `invalid`/`describedBy` props into `AdminOrganizationFilter`; add a hint "1 a {max} minutos" under the duration; clear a field's error in its `onChange`.

**ADM-10 — Running workflow runs and experiments never refresh in the admin lists**
- Area: states / freshness · [seen]
- File: `views/admin-workflows/ui/RunsPanel.tsx:142`; `views/admin-evals/ui/ExperimentsPanel.tsx:56`, `:143`
- Problem: no `refetchInterval` on the admin run or experiment queries (grep: only `entities/workflow-run/api/tenant-workflow-run-queries.ts:71` polls), and these pages have no refresh action (only logs has one, `AdminLogsView.tsx:75`).
- User impact: a run shows "running"/"suspended" and an experiment "em execução" until a full reload; staff may cancel a run that already finished.
- Fix: poll while any visible row is live (same predicate as the tenant query), or add a "Atualizar" page action like `/admin/logs`.

**ADM-11 — Run details are a modal that cannot be linked and leads nowhere**
- Area: navigation / deep links · [seen] · step events known (#46)
- File: `views/admin-workflows/ui/RunsPanel.tsx:88-111`; `widgets/run-timeline/ui/RunTimeline.tsx:57`
- Problem: details open in a `Dialog` from local state; reload loses it; the approval shows as a raw id and there is no link to the run's trace or logs.
- Fix: put the open run in the URL (`?run=`) or a `/admin/workflows/runs/:runId` page, pass `renderApproval`, and link to `/admin/traces?…`/`/admin/logs?traceId=` when the run carries one.

**ADM-12 — Experiments are identified only by an opaque id**
- Area: UX / raw ids · [seen] · filters known (#45)
- File: `views/admin-evals/ui/ExperimentsPanel.tsx:24`; `widgets/experiment-compare/ui/ExperimentCompare.tsx:42-43`
- Problem: the row title and the chart series ("A · {id}") are `experimentId`; agent, dataset and date are secondary.
- Fix: title rows "{agent} · {dataset} v{n} · {date}" (prompt version when present) and keep the id as the mono secondary line; use the same label for the series.

**ADM-13 — "Uso por modelo" table stays a 7-column horizontal scroller on phones**
- Area: responsive · [seen] layout, [inferred] impact
- File: `views/admin-costs/ui/UsageBreakdown.tsx:112`
- Problem: the only `DataTable` in scope without `renderCard`; every other admin table becomes cards below 768 px.
- Fix: add `renderCard` (model, provider, cost, calls, tokens in one block).

**ADM-14 — Invalid usage range is reported as muted text, with nothing marked and no way back**
- Area: forms / error state · [seen]
- File: `views/admin-costs/ui/UsageBreakdown.tsx:156-163`, `:174-178`
- Problem: the dates get no `aria-invalid`/`aria-describedby`, the message is `text-muted-foreground`, and there is no "limpar período" action.
- Fix: mark both inputs invalid and describe them by the message, style it as a field error, add a reset button that clears `from`/`to`.

**ADM-15 — Three different time-zone rules for dates on the same console, and the trace one is a tooltip**
- Area: dates / i18n · [seen]
- File: `views/admin-traces/ui/TraceFilters.tsx:69`, `:73`; `views/admin-traces/model/trace-date-range.ts:20-22`; `views/admin-costs/ui/UsageBreakdown.tsx:49`, `:68`; `shared/lib/format/use-format-date-time.ts:11-13`
- Problem: trace day filters use the browser zone; usage days are UTC; displayed times use the provider's display zone (else browser). The trace hint is only in `title=` (invisible on touch and to most screen readers).
- Fix: pick one rule for staff (UTC or the staff's zone), state it next to every date filter as visible helper text, and show the zone abbreviation in date-time cells.

**ADM-16 — Trace filter row does not wrap on large screens**
- Area: responsive · [seen] CSS, [inferred] overflow
- File: `views/admin-traces/ui/TraceFilters.tsx:52`
- Problem: `lg:flex-row` without `lg:flex-wrap`, five controls with fixed `lg:w-*` widths plus a button; the sibling filter rows have `lg:flex-wrap` (`RunsPanel.tsx:62`, `LogFiltersForm.tsx:35`).
- Fix: add `lg:flex-wrap` (confirm with a 1024/1280 px screenshot).

**ADM-17 — The actionable list on /admin/costs comes fourth and is unbounded**
- Area: hierarchy / long lists · [seen]
- File: `views/admin-costs/ui/AdminCostsView.tsx:207-215`, `:62-97`
- Problem: order is KPIs → chart → usage breakdown → "Precisam de atenção" → budgets; the attention list renders every flagged organization with no paging.
- Fix: move `Attention` right under the KPIs, cap it at ~10 rows with "ver todos" setting `?level=alert` on the budgets table.

**ADM-18 — Page actions appear only after permissions load, shifting the header**
- Area: loading / layout shift · [seen] code, [inferred] shift
- File: `widgets/admin-nav/ui/AdminPageFrame.tsx:59`
- Problem: `actions` render only when `allowed`; while `permissions.status === "pending"` the right side is empty, then the button pops in.
- Fix: reserve the slot while pending (a `Skeleton` the size of a button) and render nothing only once the role is known to lack the permission.

**ADM-19 — Log and trace times have minute precision**
- Area: data display · [seen]
- File: `views/admin-logs/ui/LogLines.tsx:67`; `views/admin-traces/ui/AdminTracesView.tsx:61`; `app/packages/i18n/src/format/date-time.ts:16`
- Problem: `formatDateTime` "datetime" is `timeStyle: "short"`; dozens of log lines in one minute look identical and cannot be ordered by eye.
- Fix: add a `"precise"` style (`hour/minute/second` + `fractionalSecondDigits: 3`) to `@core/i18n` and use it for log lines and trace/span start times.

**ADM-20 — "Comparar" on a prompt version gives no visible result**
- Area: feedback · [seen]
- File: `views/admin-agent-prompts/ui/PromptVersionsTable.tsx:73`; `views/admin-agent-prompts/ui/AdminAgentPromptsView.tsx:106-110`
- Problem: the button only writes `?compare=`; the diff section is two cards below the table.
- Fix: after setting the version, scroll to and focus the diff region (it is already a focusable `region`).

**ADM-21 — Prompt versions and activation history are unpaginated**
- Area: long lists · [seen]
- File: `views/admin-agent-prompts/ui/PromptVersionsTable.tsx:118-123`; `views/admin-agent-prompts/ui/PromptActivationHistory.tsx:62-68`
- Problem: append-only stores rendered in full with no `pagination`.
- Fix: page by number like traces (newest 20) or collapse older versions behind "mostrar anteriores".

**ADM-22 — Budget override form behaves differently from the plan form next to it**
- Area: forms / consistency · [seen]
- File: `features/admin-update-organization/ui/BudgetOverrideForm.tsx:128`, `:73-77`, `:106-111`; `features/admin-update-organization/ui/OrganizationPlanForm.tsx:68`
- Problem: "Salvar" is enabled with nothing changed (the plan form disables it); field errors persist after the value is corrected; the token cap is raw digits without grouping.
- Fix: disable submit when values equal `start`; clear each error on change; format the token input on blur with `Intl.NumberFormat` (parse back before validating).

**ADM-23 — Plan features are free-typed keys**
- Area: forms / validation · [seen]
- File: `features/admin-update-plan/model/plan-form.contract.ts:20-26`
- Problem: a textarea validated only by a key-shape regex; a typo creates a feature key no code checks, silently.
- Fix: a multi-select (Combobox) over the registered feature keys, with "chave desconhecida" warning for legacy values.

**ADM-24 — Connector empty state and organization detail send staff in a circle**
- Area: navigation / dead end · [seen] · read only known (#47)
- File: `views/admin-connectors/ui/AdminConnectorsView.tsx:117-119`; `views/admin-organization-detail/ui/AdminOrganizationDetailView.tsx:19-24`
- Problem: "Abrir a organização" goes to a page with no connector information; that page's "related" links list agents, traces, flags and costs but not connectors or workflows.
- Fix: add `connectors` and `workflows` to `RELATED` (gated by their permissions); change the empty action to explain where tenants create connectors instead of linking back.

**ADM-25 — Expired flags are one long sentence and the flag list cannot be filtered**
- Area: long text / long lists · [seen]
- File: `views/admin-flags/ui/AdminFlagsView.tsx:153`, `:162-167`
- Problem: `expired.map(key).join(", ")` inside an Alert; no search or kind/expired filter for the table.
- Fix: list expired keys as badges (max ~5 + "e mais N") with a "mostrar só expiradas" toggle written to the URL; add a key search.

**ADM-26 — Run rows use machine names and raw ids as their human label**
- Area: UX / raw ids · [seen]
- File: `views/admin-workflows/ui/RunsTable.tsx:37`, `:51`, `:55`
- Problem: title is `workflowId`, origin "Agendamento {scheduleId}", "Aguarda a aprovação {id}". Cancel/details dialogs name the run by `workflowId` only, so two runs of one workflow read the same.
- Fix: translate workflow ids via `t.has("workflows.names.<id>")` like agents do; show the schedule's cron/zone instead of its id; add the start time to dialog titles.

**ADM-27 — Confirmation dialogs can still submit after going offline**
- Area: offline state · [seen]
- File: `shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx:87`
- Problem: triggers are disabled offline, but a dialog opened before the connection dropped keeps an enabled confirm; the call then fails with a generic error.
- Fix: read `useOnlineStatus()` in `ConfirmDialog`, disable confirm and show the offline line when offline.

**ADM-28 — No colocated tests for the admin features and six shared widgets**
- Area: test coverage · [seen]
- File: `features/admin-*/ui/` (all 11 slices), `widgets/admin-kpi-cards/ui/`, `widgets/admin-prompt-diff/ui/`, `widgets/experiment-compare/ui/`, `widgets/impersonation-banner/ui/`, `widgets/run-timeline/ui/`, `widgets/schedule-table/ui/`
- Problem: none has a `*.test.tsx`; behaviour is exercised only through the view tests and e2e.
- Fix: at least one test per write feature for pending/error/success/offline, and for `ExperimentCompare` outcomes and `ScheduleTable` zone display.

### Polish

**ADM-29 — Overview KPI cards are not links to their area**
- File: `widgets/admin-kpi-cards/ui/AdminKpiCards.tsx:55-68` · [seen]
- Fix: wrap cost → `/admin/costs`, eval → `/admin/evals`, organizations → `/admin/organizations` (as `RouteLink` cards with focus ring).

**ADM-30 — Agent toggles show the raw key as their description**
- File: `features/admin-agent-enablement/ui/AgentEnablementPanel.tsx:156` · [seen]
- Fix: use the translated role (`admin.agents.roles.<id>`) as hint, key as mono secondary text.

**ADM-31 — Prompt eval result shows a raw experiment id with no link**
- File: `features/admin-prompt-activation/ui/PromptEvalResultTable.tsx:19` · [seen]
- Fix: link to `/admin/evals?a=<id>` (or drop the id).

**ADM-32 — Schedules show raw cron; phone cards omit the last fire**
- File: `widgets/schedule-table/ui/ScheduleTable.tsx:93`, `:164-178` · [seen]
- Fix: add a human description ("todo dia às 03:00") under the cron; include last fire in the card.

**ADM-33 — Sidebar has 11 flat items in mixed order**
- File: `app-shell/navigation/core-navigation.ts:38-50` · [seen]
- Fix: group into labelled sections (Clientes: organizações, planos, usuários; IA: agentes, avaliações, traces, logs, custos; Operação: workflows, flags, conectores).

**ADM-34 — "Staff" badge appears twice on the overview**
- File: `app-shell/admin-layout.tsx:28`; `views/admin-overview/ui/AdminOverviewView.tsx:66-70` · [seen]
- Fix: drop the `meta` pill from the overview.

**ADM-35 — Weak empty-state actions**
- File: `views/admin-organizations/ui/AdminOrganizationsView.tsx:169-173` (leaves the console for the user's own organizations); `views/admin-traces/ui/AdminTracesView.tsx:100-104` ("Voltar à visão geral") · [seen]
- Fix: organizations: no action or a link to docs on how organizations are created; traces: link to `/admin/logs` or the agents page.

**ADM-36 — Placeholder area page uses a different header than every admin page**
- File: `views/admin-slot/ui/AdminSlotView.tsx:22` · [seen]
- Fix: render through `AdminPageFrame` (with the area's permission) so eyebrow, title size and spacing match.

**ADM-37 — Arbitrary font sizes outside the type scale**
- File: 56 uses of `text-[11.5px]`/`text-[12.5px]`/`text-[13px]` in 23 files of the scope (e.g. `views/admin-organizations/ui/AdminOrganizationsView.tsx:32`); the kit does it too (`shared/ui/molecules/StatusPill/StatusPill.tsx:13`); `.design-system/DESIGN.md:82` names only the Tailwind `text-*` scale · [seen]
- Fix: promote them to `@theme` tokens (`--text-2xs`, `--text-caption`, `--text-body-sm`) in `globals.css` and replace the literals; record the extension in DESIGN.md.

## Known items touched by this scope (not re-counted)

- #45 evals read only / client-side comparison; #46 no run step events, cancel leaves approval;
  #47 connectors read only; #48 logs local only; #52 2 000-organization lists; #57 tripwire rate
  (UI consequence counted as ADM-02); #85 flag descriptions in English on pt-BR pages; #86 prompt
  editor empty without a seed; #92 `/admin` while impersonating has no redirect.

## Counts

- blocker: 0
- major: 4 (ADM-01 – ADM-04)
- minor: 24 (ADM-05 – ADM-28)
- polish: 9 (ADM-29 – ADM-37)
