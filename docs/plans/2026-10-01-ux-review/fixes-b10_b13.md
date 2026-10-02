# B10 and B13: admin UX minors, settings and shell polish

Batches B10 (U-48, U-49, U-50, U-52, U-53, U-54, U-55, U-77, U-78, U-79, U-70 admin part) and
B13 (U-30, U-34, U-58, U-60, U-63, U-64, U-65, U-80, U-81, U-82) of `consolidated.md`. Every
finding still held when re-checked on `16d3c59e`; none was already fixed. Rebased onto B8 and B7:
`SectionNav` and the settings column switch at `lg`, as B8 set them.
Decision: `app/docs/decisions/0055-grouped-settings-and-admin-navigation.md` (U-30). U-34 keeps
decision 0042 (every `/admin` date in the browser zone; usage days stay UTC, the ledger's days, as
their section already says) and makes the rule visible instead of a tooltip.

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-48 | ADM-11 | partly fixed; rest deferred (follow-up 96) | `ef46456e` feat(admin): keep the open workflow run in the URL; `3ac6dd04` fix(admin): open a linked run only once the run list loaded | `views/admin-workflows/ui/AdminWorkflowsView.test.tsx` "keeps the open run in the URL…", "opens the run of a shared link, and says so when it is not in the list" |
| U-49 | ADM-14 | fixed | `7a7aa07b` fix(admin): mark an invalid usage range and offer to clear it | `views/admin-costs/ui/AdminCostsView.test.tsx` "marks both days of an invalid range as a field error and offers to clear the period" |
| U-50 | ADM-16 | fixed | `f36e901b` fix(admin): wrap the trace filter row on large screens | CSS only (`lg:flex-wrap`, like the sibling filter rows); the 1024/1280 px screenshot is left to the final e2e verifier |
| U-52 | ADM-20 | fixed | `a1bb721a` fix(admin): move to the diff when comparing a prompt version | `views/admin-agent-prompts/ui/AdminAgentPromptsView.test.tsx` "shows the line diff…" (focus moves to the compared region) |
| U-53 | ADM-23 | deferred (follow-up 97) | — | no registry of plan feature keys exists and nothing reads `PlanLimits.features`, so there is nothing to pick from |
| U-54 | ADM-24 | fixed | `2fb94320` fix(admin): stop the connector pages sending staff in a circle | `views/admin-organization-detail/ui/AdminOrganizationDetailView.test.tsx` (connectors and workflows links, each gated; support sees Conectores, Traces, Custos); `views/admin-connectors/ui/AdminConnectorsView.test.tsx` "explains where an organization's connectors are created…" |
| U-55 | ADM-25 | fixed | `65eb41af` feat(admin): filter the flag list and list expired keys as badges | `views/admin-flags/ui/AdminFlagsView.test.tsx` "lists at most five expired keys and filters the table to the expired ones through the URL", "searches the flags by key or name…" |
| U-70 (admin part) | ADM-35 | fixed | `3219ddc7` fix(admin): give the empty organization and trace lists real next steps | `views/admin-organizations/ui/AdminOrganizationsView.test.tsx` "explains how organizations appear, without leaving the console"; `views/admin-traces/ui/AdminTracesView.test.tsx` (empty list → "Ver os logs" → `/admin/logs`) |
| U-77 | ADM-29 | fixed | `ea0486c7` feat(admin): link the overview KPIs to their areas | `views/admin-overview/ui/AdminOverviewView.test.tsx` "links each KPI to its area, only when the role may open it…", "keeps a KPI as plain text when the role cannot open its area" |
| U-78 | ADM-34 | fixed | `25471223` fix(admin): drop the second staff badge from the overview | same file, "…and shows no second staff badge" |
| U-79 | ADM-36 | fixed | `d641adad` fix(admin): render placeholder areas in the admin page frame | `views/admin-slot/ui/AdminSlotView.test.tsx` (existing cases, now through `AdminPageFrame`) |
| U-30 | S-m12, ADM-33 | fixed | `d6ec9792` feat(client): group the settings and admin navigation; `aca4ddc7` docs(client): renumber the grouped navigation decision to 0055 | `shared/lib/shell/group-nav-items.test.ts`; `widgets/settings-nav/ui/SettingsNav.test.tsx` "groups the settings sections under headings, with a section picker on phones"; `widgets/admin-sidebar/ui/AdminSidebar.test.tsx` (Clientes, IA, Operação, Outras); `app-shell/navigation/navigation-registry.test.ts` (order and groups); e2e `settings.spec.ts` viewer case uses the picker on phones |
| U-34 | ADM-15, ADM-19 | fixed | `21d24582` feat(i18n): add a precise date-time style to the millisecond; `ed4b1786` fix(admin): show trace and log times precisely and state the zone | `i18n/src/format/date-time.test.ts` "formats the precise style…"; `views/admin-logs/ui/AdminLogsView.test.tsx` (`:00:05,000 <zone>`); `views/admin-traces/ui/AdminTracesView.test.tsx` (visible zone hint describing both days, no `title`; start time to the ms with the zone) |
| U-58 | S-m11 | fixed | `e5c1b420` feat(client): pick the trace agent by name from the catalog | `views/settings-traces/ui/SettingsTracesView.test.tsx` "picks the agent by name from the organization's catalog…", "falls back to typing the agent key when the catalog cannot be read", and the typed-key case without the permission |
| U-60 | S-m16 | fixed | `403fa21c` feat(client): show agents as compact rows with details on demand | `views/settings-agents/ui/SettingsAgentsView.test.tsx` "keeps each agent compact and loads its instructions only when its details open" (no prompt-addendum request before); e2e `settings-agents.spec.ts` opens the details first |
| U-63 | SH-17 | fixed | `a47ed560` fix(client): open the unit picker below its trigger on phones | `widgets/unit-picker/ui/UnitPicker.test.tsx` "opens below the trigger and within the screen on phones" |
| U-64 | SH-18 | fixed | `db2de3ce` refactor(client): build the profile nav from the user-menu registry | `widgets/settings-nav/ui/SettingsNav.test.tsx` "builds the profile sections from the user-menu navigation, like the user menu" |
| U-65 | SH-19 | fixed | `ed046bd2` fix(client): break long page titles instead of overflowing | CSS only on the `PageHeader` and `AdminPageFrame` `h1` (`min-w-0 break-words [overflow-wrap:anywhere]`); the 360 px check is left to the final e2e verifier |
| U-80 | S-p3 | fixed | `e1fae3b4` fix(client): hide the expiry of settled invitations | `views/settings-invitations/ui/SettingsInvitationsView.test.tsx` "shows no expiry on accepted or revoked invitations" |
| U-81 | S-p4 | fixed | `da5bed9e` fix(client): say why a unit takes no sub-units instead of offering one | `views/settings-units/ui/SettingsUnitsView.test.tsx` "does not offer a sub-unit under a type that allows none, and says why" |
| U-82 | S-p7 | deferred (follow-up 98) | — | the run-now endpoints answer 202 `{ scheduleId }`: the runtime queues the fire, so no run id exists when the toast shows |

Deferred:

- **U-48, second half** (follow-up 96): there is no endpoint for one staff run by id (it needs a
  console route in `@core/agents`, a gateway method and a contract), and `AdminWorkflowRun` has no
  `traceId`, so the details cannot load a run outside the loaded rows or link to its trace and logs.
- **U-53** (follow-up 97): no registry of plan feature keys exists and no code reads
  `PlanLimits.features`; a multi-select needs that registry first.
- **U-82** (follow-up 98): run-now returns `{ scheduleId }` at 202 because the runtime queues the
  fire; a link to the run needs the runtime to return a `runId`.
