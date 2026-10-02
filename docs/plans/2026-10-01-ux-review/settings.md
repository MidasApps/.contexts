# UX review — tenant settings (`/o/:organizationId/settings/*`)

Scope: every view under `app/packages/client/src/views/settings-*`, the features and entities they
use, the shared blocks they render (`SettingsNav`/`SettingsPageFrame`, `QueryPage`/`QuerySection`,
`DataTable`, `ScheduleTable`, `RunTimeline`, `TraceViewer`, `ExperimentCompare`), and the web route
`app/apps/web/src/app/[locale]/(app)/o/[organizationId]/settings/**`.
The review was read-only. All paths below are relative to `app/packages/client/src/` unless they
start with `app/`.

Method: I read the code and colocated tests of every view, feature dialog and widget listed in the
table. Component tests ran green:
`pnpm -C app/packages/client exec vitest run src/views/settings- src/widgets/settings-nav --maxWorkers=2`
→ 20 files, 143 tests passed. I took no browser screenshots (memory is tight), so any finding about
layout at a given width comes from the layout constants and is labelled **derived**.

Cross-cutting checks I ran:
- **i18n parity:** pt-BR, en-US and es-419 have the same keys in `settings.json`, `common.json` and `errors.json`.
- **Dynamic keys:** every computed key resolves: skill and agent editor errors, `eventTypes.*` for each `WORKFLOW_EVENT_TYPES`, `runTimeline.status.*` for each `WORKFLOW_RUN_STATUSES`, and `knowledge.sources.*`.
- **Plurals:** counts use ICU `plural`.
- **Hard-coded copy:** the views have none.
- **Hard-coded colors:** none in scope. The tokens `muted-foreground-strong` and `destructive-text` exist in `globals.css`.
- **Dates:** they format in the tenant's display time zone (`ShellIntlProvider` → `useFormatDateTime`).
- **Focus and motion:** global `:focus-visible` and `prefers-reduced-motion` styles exist.

"Projects" has no `/settings` section (projects live on the organization page). The unit tree's
empty state links there. I found no separate "API keys and devices" area beyond `api-keys` and `devices`.

## Summary

States: L = loading, E = empty (with action), Er = error (code + reference + retry), NP = no
permission, Off = offline, P = pagination, C = destructive confirmation, Pend = pending/double-submit
guard, V = per-field validation, T = success toast/inline.

| Screen / block / component | States covered | Verdict |
|---|---|---|
| Route `settings/[section]/[[...rest]]`, `settings/m/[moduleId]` (web) | unknown section → NotFound | Minor gap: bare `/settings` is a 404 (S-m18) |
| `SettingsNav` + `SettingsPageFrame` + `SettingsTemplate` | L (skeleton), NP per section, `aria-current` | Works. 17 ungrouped items (S-m12). The 720 px content cap squeezes tables (S-M3) |
| `QueryPage` / `QuerySection` | L, Er + retry, 403 → NoAccess, 404 → error in section | OK. A detail page under a section turns 404 into a retryable error (S-m6) |
| `DataTable` error path (members, invitations, roles, api-keys, devices, knowledge, connectors) | Er shows generic copy + reference | Error code ignored (S-m1) |
| general — `SettingsGeneralView`, `UpdateOrganizationForm` (SchemaForm), read-only details | L, Er, NP, V, Pend, T (inline "saved") | Good. Raw zone and currency codes in read-only mode (S-p2) |
| members — `SettingsMembersView`, `EditGrantRolesDialog`, `RemoveMemberDialog`, `InviteMemberDialog` | L, E + invite, Er, NP, P, C, Pend, T, `LAST_OWNER`/`ESCALATION` in dialog | Good. List error generic (S-m1); invite link closable (S-M1) |
| invitations — `SettingsInvitationsView`, `RevokeInvitationDialog` | L, E (pending/all), Er, NP, P, C, T | Good. Filter not in URL (S-m4); expiry shown for settled rows (S-p3) |
| roles — `SettingsRolesView`, `RoleEditorDialog`, `DeleteRoleDialog` | L, E + create, Er, NP, C, V (name, ≥1 permission), Pend, T | Dead end when the permission catalog fails or is still loading (S-M2) |
| units — `SettingsUnitsView`, `UnitTreeEditor`, `UnitNameDialog`, `MoveUnitDialog`, `TreeView` | L, E + create, no-project E, Er, NP, C (subtree count), V, Pend, T, truncation note | Good. Project picker not in URL (S-m4); leaf "create child" (S-p4) |
| api-keys — `SettingsApiKeysView`, `CreateApiKeyDialog` + `OneTimeSecret`, `RevokeApiKeyDialog` | L, E + create, Er, NP, Off, P, C, V, Pend, T | Secret dialog dismissible (S-M1); scopes picker empty on catalog error (S-M2); 7 columns (S-M3); offline copy (S-m3) |
| devices — `SettingsDevicesView`, `CreateDeviceActivationDialog` + `ActivationCode`, `RevokeDeviceDialog` | L, E + create, Er, NP, Off, P, C, Pend, T, countdown | Activation code dismissible (S-M1); offline copy (S-m3) |
| agents — `SettingsAgentsView`, `AgentCard`, `OrganizationAgents`, `AgentEnabledSwitch`, `OrganizationAgentRules` | L, E, Er, NP, Off, read-only for readers, optimistic switch + rollback, T | Works. Dense page (S-m16); raw tool/module ids (S-M4); switch rollback race (S-m5) |
| agents — `CustomAgentEditorDialog`, `CustomAgentFields`, toggle and delete dialogs | L (record), Er + retry, V per field (+ API details), cap reached, Pend, C, T | Good. Tool choices labelled by raw id (S-M4) |
| agents — `AgentInstructions`, `AddendumVersionsTable`, `AddendumVersionDialog` | L, Er, NP, evaluate/activate pending, failure inline | Activation needs a passed eval, and the reason is only a `title` tooltip; activation has no confirmation (S-m15) |
| skills — `SettingsSkillsView`, `OrganizationSkills`, `CustomSkillEditorDialog`, toggle and delete dialogs | L, E, Er, NP, Off, cap, V (incl. 409 taken), Pend, C, T | Good |
| knowledge — `SettingsKnowledgeView`, `KnowledgeDocumentsTable`, `IngestionNotices`, `AddKnowledgeDocumentDialog`, `DeleteKnowledgeDocumentDialog` | L, E + add, Er, NP, Off, P, upload steps, failure + retry + dismiss, C, T | No vertical rhythm (S-m2); ingestion notices lost on reload (S-m17); raw ids (S-p8); closable mid-upload (S-p6) |
| connectors — `SettingsConnectorsView`, `ConnectorEditorDialog`/`ConnectorFields`, `ConnectorSecretDialog`, toggle and delete dialogs | L, E + create, Er, NP, Off, P, V, write-only secret, C, Pend, T | "Error" status unexplained; no secret step after create (S-m13); offline copy (S-m3) |
| workflows — `SettingsWorkflowsView`, `RunsSection`, `StartWorkflowRunDialog`, `CancelWorkflowRunDialog` | L, E (+ filtered no-match + clear), Er, NP, Off, P, C, Pend, T, catalog-failed warning | Raw ids as labels (S-M4); JSON input (S-M5); list not live (S-m8); tab and filters not in URL (S-m4) |
| workflows — `SchedulesSection`, `ScheduleTable`, `ScheduleEditorDialog`/`CronFields`, `ScheduleActionDialog` | L, E + create, Er, NP, Off, C (pause, run, delete), V per field, known refusals, Pend, T | Cron shown raw (S-m19); JSON input (S-M5); 6 columns + up to 5 buttons (S-M3) |
| workflows run page — `RunPage`, `RunTimeline`, `useRunEvents` | L, Er, live poll + SSE, cancel C, back link, approval link | 404 → retry error (S-m6); failed run has no reason or next step (S-m7); raw ids in `h1` (S-M4) |
| approvals — `SettingsApprovalsView`, `ApprovalsInbox`, `ApprovalDetail`, `ApprovalDecision`, `ApprovalRequestItem` | L, E per tab, Er, NP, Off, not-found + back, four-eyes blockers explained, reject C, Pend, T, 15 s refetch | Good. 300-request silent cap (S-m9); raw permission key (S-m10); tab not in URL (S-m4) |
| usage — `SettingsUsageView`, `UsageSummaryPanel`, `UsageCapForm` | L, E (models), Er, NP, Off, meter with text, alert/over banners, V, Pend, T | No vertical rhythm (S-m2); unconfirmed "remove cap" (S-m14) |
| traces — `SettingsTracesView`, `TraceList`, `TraceFilters`, `TraceDetail`, `TraceViewer` | L (keeps previous page), E + no-match + clear, Er, NP, P, not-found, collapsible spans | Free-text agent filter (S-m11); 7 columns (S-M3); filters not in URL (S-m4) |
| evals — `SettingsEvalsView`, `ExperimentsPanel`, `DatasetsPanel`, `ExperimentCompare`, `StartEvalExperimentDialog` | L, E + start, Er, NP, Off, P, stale-compare warning, V, Pend, T | 9 columns (S-M3); raw ids (S-M4); compare far from toggles (S-p9) |
| flags — `SettingsFlagsView`, `TenantSetFlagDialog` | L, E, Er, NP, Off, C, T, "platform off" explained | Raw keys and English reasons (S-m10, follow-up 85); override can't be cleared (follow-up 56) |
| module settings — `SettingsModuleView`, `ModuleSettingsForm` | not-found, L, Er, NP, read-only note + disabled fieldset, SchemaForm states | Good |

## Findings

### Major

**S-M1 — One-time secrets, invite links and activation codes are lost on Esc, a click outside the dialog or the close button**
- Severity: major · Area: api-keys, members/invitations, devices
- Where: `features/create-api-key/ui/CreateApiKeyDialog.tsx:164`, `features/invite-member/ui/InviteMemberDialog.tsx:165` and `features/create-device-activation/ui/CreateDeviceActivationDialog.tsx:127` all pass `onOpenChange={props.onOpenChange}` straight to `<Dialog>`. `shared/ui/molecules/OneTimeSecret/OneTimeSecret.tsx:46` gates only the "Done" button on the "I stored it" checkbox. No `onEscapeKeyDown`, `onInteractOutside` or `onPointerDownOutside` guard exists anywhere in `shared/ui` or `features`.
- Problem: the acknowledgement guards only one of four ways out. Esc, the overlay or the X unmount the body, and the comment there says the secret or link "is never rendered again".
- User impact: an admin who presses Esc by reflex loses an API key secret, an invite link or a device code. They then have to revoke and create it again. With keys this also leaves an orphan key active until someone revokes it.
- Fix: while a one-time value is on screen, make the dialog modal-strict. Block `onEscapeKeyDown` and `onInteractOutside`, hide the X, and route `onOpenChange(false)` through the same "stored?" check. Alternatively, open a confirm ("Close without copying? It will not be shown again"). Put the guard in one place (a `oneTimeValue` prop on `DialogContent` or a `useOneTimeDialogGuard`) and use it in all three dialogs. Add a component test that Esc does not close the dialog before acknowledgement.

**S-M2 — Role editor and API-key scopes show an empty permission picker when the permission catalog fails or is still loading**
- Severity: major · Area: roles, api-keys
- Where: `views/settings-roles/ui/SettingsRolesView.tsx:128` and `:174` pass `permissions={catalog.data ?? []}`. The header button waits for the catalog (`:156`), but the empty-state "Create role" (`:119`) and every row's "Edit" do not. `features/create-api-key/ui/CreateApiKeyDialog.tsx:85` does the same after its pending check. `entities/role/ui/PermissionPicker.tsx` has no empty or error branch.
- Problem: if `GET /v1/permissions` errors, or the user opens the editor before it resolves, the picker renders no options. Submit then fails with "choose at least one permission", and nothing says why.
- User impact: the user cannot create or edit a role or an API key, gets no explanation and has no retry.
- Fix: give `PermissionPicker` (or the dialogs) explicit loading and error states, with an `ApiErrorState` and retry inside the dialog. Disable every create and edit entry point while `catalog.isPending`, not only the header button.

**S-M3 — Data-heavy sections render wide tables inside a ≤720 px column (derived, not screenshotted)**
- Severity: major · Area: layout (traces, evals, api-keys, workflows/schedules, workflows/runs)
- Where: `shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx:25` sets the nav to `md:w-[220px]` with `md:gap-10`, and `:28` caps the content at `max-w-[720px]`. `DataTable` switches to cards only below `md` (`useIsMobile` = `max-width: 767px`). Column counts:
  - traces: 7 (`views/settings-traces/ui/TraceList.tsx`, `useColumns`)
  - experiments: 9, including a "compare" button column (`views/settings-evals/ui/ExperimentsPanel.tsx:70`)
  - api-keys: 7 (`views/settings-api-keys/ui/SettingsApiKeysView.tsx`, `useColumns`)
  - schedules: 6, with up to five row buttons: pause/resume, run now, edit, delete (`widgets/schedule-table/ui/ScheduleTable.tsx`)
  - runs: 6, with "Open" and "Cancel"
- Problem: from 768 px the table layout applies. The content column is then roughly 768 − 260 − page padding (about 450 px) wide, and at most 720 px on a 1280 px screen. These tables need more width, so they scroll sideways, and the row actions sit offscreen to the right.
- User impact: on tablets and laptops the main actions (Revoke, Cancel, Pause, Compare) and key columns are hidden behind horizontal scroll inside a scroll region.
- Fix: let list-heavy sections opt out of the reading cap (`SettingsTemplate` `width="wide"` → `max-w-none`). Use cards up to `lg` for tables with more than 5 columns, or move secondary columns into the row's first cell. Group row actions in a `DropdownMenu` ("…") from the kit. Confirm with Playwright screenshots at 768 and 1280.

**S-M4 — Machine ids are the primary labels in workflows, schedules, evals, flags and agent tools**
- Severity: major · Area: workflows, schedules, evals, flags, agents
- Where:
  - `views/settings-workflows/ui/RunsSection.tsx:30`: run name `{run.workflowId}` plus `runId`.
  - `RunsSection.tsx:102`: filter options `{workflow.id}`.
  - `RunsSection.tsx:40` and `widgets/run-timeline/ui/RunTimeline.tsx:49`: "Started by schedule {scheduleId}".
  - `views/settings-workflows/ui/RunPage.tsx:106`: the `h1` "Execução de {workflowId}".
  - `features/start-workflow-run/ui/StartWorkflowRunDialog.tsx:105-106` and the schedule editor's workflow select.
  - `widgets/schedule-table/ui/ScheduleTable.tsx:85`: `{schedule.id}` under the workflow id.
  - `views/settings-evals/ui/ExperimentsPanel.tsx:34`: `experimentId` as the name, plus a raw `datasetId` column and agent key.
  - `features/start-eval-experiment/ui/StartEvalExperimentDialog.tsx:57,63`: agent keys in mono.
  - `views/settings-flags/ui/SettingsFlagsView.tsx:26`: `flag.key`.
  - `views/settings-agents/ui/AgentCard.tsx:35` and `features/custom-agent-editor/ui/CustomAgentFields.tsx:132`: tool ids.
  - `AgentCard.tsx:80`: `moduleId` as the module name.

  The contract `WorkflowCatalogEntrySchema` (`app/packages/contracts/src/contracts/workflows/workflow-catalog.schema.ts:10`) has only `id` and `description`. There is no display name.
- Problem: the review criterion is "no raw ids/codes shown to users". Here kebab-case keys and ULIDs are the headline, and the pt-BR copy wraps them, as in "Execução de approval-demo".
- User impact: a tenant admin cannot tell workflows, schedules or experiments apart without knowing internal keys, and pt-BR pages read half in code.
- Fix (inside `app/` only):
  1. Add `labelKey` (i18n), or `name` plus a localized description, to the workflow catalog, tool and flag contracts. Record this in an ADR under `app/docs/decisions/`.
  2. Show the label as the name and keep ids as secondary mono text, or show them only on detail pages.
  3. Resolve `scheduleId` to the schedule's workflow label plus cron description.
  4. Name experiments as "{agent label} · {dataset name} · {date}".
  5. Resolve `moduleId` through the module registry `labelKey`, as the settings module page already does.

**S-M5 — Starting a workflow and scheduling one require hand-written JSON, with the JSON Schema dumped as help**
- Severity: major · Area: workflows, schedules
- Where: `features/start-workflow-run/ui/StartWorkflowRunDialog.tsx:117` (`<Textarea className="font-mono">` for the input) and `:41` (the raw `inputSchema` printed in a `<pre>`). `features/schedule-editor/ui/ScheduleEditorDialog.tsx:171` takes JSON input for every fire.
- Problem: the kit already renders forms from contracts (`shared/ui/organisms/SchemaForm`, used by general and module settings). The catalog even ships `inputSchema`, yet the user has to write JSON. Validation only says "not a JSON object" and never which field is wrong.
- User impact: a non-developer admin cannot start or schedule a workflow that takes input. Server refusals arrive as a generic alert, not next to a field.
- Fix: render `inputSchema` with `SchemaForm`, or a JSON-Schema-to-fields adapter limited to the supported types. Keep "Edit as JSON" as an advanced toggle. Map `VALIDATION_FAILED.details` to fields. When `inputSchema` is null, hide the input field instead of showing `{}`.

### Minor

**S-m1 — List errors in `DataTable` ignore the error code, and retry shows no pending state**
- Where: `shared/ui/organisms/DataTable/DataTable.tsx:199` renders `ErrorState` with only `requestId` and `onRetry`. Every caller builds the status the same way (e.g. `views/settings-members/ui/SettingsMembersView.tsx:93`). This affects members, invitations, roles, api-keys, devices, knowledge and connectors.
- Problem: `QuerySection` uses `ApiErrorState` (message from `errors.<CODE>`, 403 → NoAccess, `retrying`). The tables show the generic "something went wrong" for every code, 403 included, and the retry button never shows pending.
- Impact: the user does not learn whether the failure was permissions, rate limiting or a network problem, and may click retry repeatedly.
- Fix: let `DataTableStatus` carry `error: unknown` and `retrying`, then render `ApiErrorState` (or `NoAccessState` on 403) inside `DataTable`. Collapse the seven copies of `statusOf` into one helper (`dataTableStatusOf(query)`).

**S-m2 — Knowledge and Usage pages have no vertical spacing between blocks**
- Where: `views/settings-knowledge/ui/SettingsKnowledgeView.tsx:101-145` and `views/settings-usage/ui/SettingsUsageView.tsx:78-83` render their blocks as direct children of the template's `<section>`, with no `flex flex-col gap-*` wrapper. Every other section wraps them (e.g. connectors at `:185`).
- Problem: on Knowledge, the offline notice, info alert, collection picker, notices and table touch each other. On Usage, the month picker, summary and cap card stack with no gap.
- Fix: wrap the content in `<div className="flex flex-col gap-4">`. Better, give `SettingsTemplate`'s `<section>` a default gap so this cannot recur.

**S-m3 — Offline empty states say "you don't have permission"**
- Where:
  - `views/settings-api-keys/ui/SettingsApiKeysView.tsx:159` passes `onCreate={canCreate && online ? … : null}`, and `:123` chooses `emptyDescriptionNoPermission` when `onCreate === null`.
  - The same pattern is in `views/settings-devices/ui/SettingsDevicesView.tsx:108` and in connectors (`onCreate={writable ? create : null}`).
  - Roles: `create` is null offline, and the empty copy at `:119` keys on it.
- Impact: an admin who is offline is told they lack permission, which is wrong and alarming.
- Fix: choose the copy from the permission, not from `onCreate`. When offline, keep the action visible but disabled, next to the `OfflineNotice`.

**S-m4 — Filters, tabs, pickers and pages are component state, so a reload or a shared link loses them**
- Where:
  - invitations filter: `views/settings-invitations/ui/SettingsInvitationsView.tsx:134`
  - workflows tab (`views/settings-workflows/ui/SettingsWorkflowsView.tsx:68`, `defaultValue`) and run filters (`RunsSection.tsx:147`)
  - approvals tab: `views/settings-approvals/ui/ApprovalsInbox.tsx:59`
  - traces filters and page: `views/settings-traces/ui/TraceList.tsx:130`
  - evals tab and page: `SettingsEvalsView.tsx`, `ExperimentsPanel.tsx:169`
  - knowledge collection: `SettingsKnowledgeView.tsx`
  - units project: `views/settings-units/ui/SettingsUnitsView.tsx:47`
- Problem: the `/admin` equivalents keep filters in `search` ("filters are shareable links", `route-paths.ts`), but the settings route has no `search`. After opening a run or trace and pressing the in-page "Back", the user lands on page 1 with no filters.
- Fix: add `search?` to the `settings` route (as for `admin`) and read and write it with `useSearchParam`, at least for tabs, filters and page.

**S-m5 — Agent switches can roll back each other's optimistic change (derived from code)**
- Where: `features/tenant-agent-settings/ui/AgentEnabledSwitch.tsx:31` sends the full `enabledAgents` array. Each switch has its own `saving` flag, and `features/tenant-agent-settings/model/use-save-tenant-agent-settings.ts:38` restores the `current` snapshot on failure.
- Problem: an admin toggles agent A and then agent B quickly. B's request includes A. If A's request fails, its rollback writes the pre-A snapshot over the cache and visually reverts B too. The server keeps B's write, so the screen disagrees with the server until a refetch.
- Fix: share one save queue per organization (disable every switch while one save is in flight), or refetch after a failure instead of restoring a stale snapshot.

**S-m6 — A run that does not exist shows a retryable error instead of "not found"**
- Where: `views/settings-workflows/ui/RunPage.tsx:124` uses `QuerySection`, which turns a 404 into `ApiErrorState` with retry (`widgets/page-state/ui/QuerySection.tsx`, comment "not-found reads as an error"). `useTenantWorkflowRun` does not map 404 to null.
- Problem: approvals and traces show a proper not-found with "Back"; runs do not.
- Impact: a link to another organization's run, or to a purged run, invites pointless retries.
- Fix: use `nullOnNotFound` in `tenantWorkflowRunQuery` and render the same `EmptyState` as `UnknownPage` (with "Back to runs").

**S-m7 — A failed or tripped run explains nothing and offers no next step**
- Where: `widgets/run-timeline/ui/RunTimeline.tsx` shows only the status pill. `RunPage` offers only "Back" and, while the run is alive, "Cancel". The run contract has no error field.
- Impact: "Falhou" or "Parada por guardrail" leaves the admin without a reason or a way to try again.
- Fix: expose a safe `failure { code, messageKey }` on the run (contract + ADR under `app/`) and show it with the trace link, which the trace already has. Add "Run again with the same input" when the workflow is startable.

**S-m8 — The runs list is not live**
- Where: `entities/workflow-run/api/tenant-workflow-run-queries.ts:71` polls only the single run, so the list query has no `refetchInterval`.
- Impact: after "Run now" or a start, the list shows "Em execução" until the window regains focus. The run page, by contrast, updates every 2 s.
- Fix: poll the list (for example every 5 s) while any visible row is cancelable, as the approvals inbox already does every 15 s.

**S-m9 — The approvals inbox silently stops at 300 requests, and History is unpaginated**
- Where: `entities/approval-request/api/approval-request-queries.ts:10` sets `APPROVALS_MAX_PAGES = 3` (3 × 100). `views/settings-approvals/ui/ApprovalsInbox.tsx` splits that one read into three tabs, shows no truncation notice and has no pagination.
- Impact: older pending requests can disappear from "Aguardando minha decisão" with no hint. History grows into a very long list that is refetched every 15 s.
- Fix: query `status=pending` for the "waiting" and "mine" tabs (server filter), page History with `useCursorPages`, and show a notice when the cap is reached.

**S-m10 — Approvals and flags show internal codes as content**
- Where: `views/settings-approvals/ui/ApprovalDetail.tsx:35` shows `request.permission` (e.g. `core.member.remove`) under "Permissão". `views/settings-flags/ui/SettingsFlagsView.tsx:26` shows `flag.key` as the name, with `reason` in English (already **follow-up 85**).
- Fix: render the permission through the permissions catalog label (`permissions.json` has one per permission). Give flags `labelKey` and `descriptionKey` (see S-M4).

**S-m11 — The traces agent filter is free text that must be a kebab-case key**
- Where: `views/settings-traces/ui/TraceFilters.tsx:58` (an `Input` validated by `/^[a-z][a-z0-9-]*$/`).
- Impact: the user has to know internal agent keys, and typing "Assistente" gives a format error.
- Fix: use a `Select` fed by `useAgentCatalog` (names → keys) plus "any agent", as the evals dialog already does.

**S-m12 — Settings navigation is a flat list of 17 sections**
- Where: `app-shell/navigation/core-navigation.ts:7` and `widgets/settings-nav/ui/SettingsNav.tsx:29`.
- Problem: there is no grouping, for example Organization (general, members, invitations, roles, units), Access (api-keys, devices), Agents (agents, skills, knowledge, connectors) and Operations (workflows, approvals, usage, traces, evals, flags). On phones the 17 items become one horizontal pill row, and the current pill may sit offscreen.
- Fix: add a `group` to the settings nav items and render group headings at `md` and up. On mobile, use a `Select` or a "Sections" sheet, and scroll the current pill into view.

**S-m13 — A connector in "error" gives no reason, and creating one does not lead to its secret**
- Where: `views/settings-connectors/ui/SettingsConnectorsView.tsx:26` (`error: "danger"` pill only). `features/connector-editor/ui/ConnectorEditorDialog.tsx:55-56` closes on create with a toast.
- Impact: the admin sees "Erro" with no next step. A new bearer or API-key connector stays unusable until they find "Set secret" in the row.
- Fix: add `lastError { code, at }` to the connector read model and show it under the pill. After creating a connector whose auth needs a secret, open `ConnectorSecretDialog` right away, or show a toast action "Definir segredo".

**S-m14 — Removing the usage cap has no confirmation, and the form cannot tell "own cap" from "plan cap"**
- Where: `features/set-usage-cap/ui/UsageCapForm.tsx:107` ("Remover" sends `budget: null` at once). The form starts from the caps in force, so it is the same whether or not an own cap exists. The tokens input `:97` shows raw digits with no grouping.
- Impact: a misclick lifts a cost guard. "Save" with untouched values silently creates an own cap equal to the plan. "1000000000" is hard to read.
- Fix: show whether an own cap is set, and enable "Remove" only when it is, behind a confirmation. Format tokens with `format.number` on blur (`NumberInput` if the kit has one).

**S-m15 — Activating instructions: the disabled reason is a tooltip only, and there is no confirmation**
- Where: `features/tenant-prompt-addendum/ui/AddendumVersionsTable.tsx:47` (`title={t("needsEval")}` on a disabled button) and `:49` (activate with no confirmation).
- Impact: a disabled button with a `title` gives no explanation to keyboard or touch users, because disabled buttons get no focus or hover. Activation changes the live behaviour of an agent for the whole organization in one click.
- Fix: write the reason next to the row ("Avalie antes de ativar"), or keep the button enabled and explain on click. Confirm activations and rollbacks with a `ConfirmDialog` that names the agent and version.

**S-m16 — The agents page is very long and makes two requests per agent**
- Where: `views/settings-agents/ui/SettingsAgentsView.tsx:32` and `views/settings-agents/ui/AgentCard.tsx` give every catalog agent a full card. Each card holds `AgentInstructions` (versions and activations queries plus a versions table), the tool list and the skill list. Nothing collapses.
- Impact: with a few modules installed the page becomes a long scroll, the switch for each agent is hard to find, and every agent fires two requests on load.
- Fix: make each agent a compact row (name, source, switch, counts) and move instructions, tools and skills into a disclosure or detail sheet that loads on expand.

**S-m17 — Knowledge ingestion notices live only in page state**
- Where: `views/settings-knowledge/ui/SettingsKnowledgeView.tsx:63` (`useState` of started runs).
- Impact: after a reload or navigation, a pending or failed ingestion disappears with no retry. The failure path fixed for SP5 gate item 5 only works while the user stays on the page. Related to **follow-up 91**.
- Fix: list recent `knowledge-ingest` runs (tenant runs filtered by workflow) on mount, or keep started runs in `sessionStorage` keyed by organization.

**S-m18 — `/o/:organizationId/settings` without a section is a 404**
- Where: `app/apps/web/src/app/[locale]/(app)/o/[organizationId]/settings/` has only `[section]/[[...rest]]` and `m/[moduleId]`, with no `page.tsx`. The desktop route tree has the same gap (`settings/$section`, `settings/m`).
- Impact: users who shorten the URL, or bookmark the parent path, hit Not Found.
- Fix: add a settings index that redirects to the first section the viewer can read (general → … by `visibleItems("settings")`).

**S-m19 — The schedules table shows raw cron, although the editor has presets**
- Where: `widgets/schedule-table/ui/ScheduleTable.tsx:93` (`<code>{schedule.cron}</code>`). `features/schedule-editor/model/cron-presets.ts` already maps presets.
- Impact: "0 9 * * 1-5" means nothing to most admins.
- Fix: describe preset-shaped crons in words ("Dias úteis às 09:00") from `draftOfCron`, and keep the expression as secondary mono text.

### Polish

**S-p1 — Arbitrary font sizes instead of the type scale**
- Where: about 160 occurrences in scope and shared UI. Counted with `grep -rhoE "text-\[[0-9.]+px\]"`: `text-[13px]` ×62, `text-[11.5px]` ×37, `text-[12.5px]` ×36, and smaller sizes. Examples: `views/settings-workflows/ui/RunsSection.tsx:31`, `widgets/schedule-table/ui/ScheduleTable.tsx:85`.
- Problem: `.design-system/DESIGN.md` §Tipografia says "Escala via tailwind `text-*`".
- Fix: add `--text-2xs`, `--text-xs-plus` and `--text-sm-minus` (or similar) to `@theme` in `globals.css` and replace the literals.

**S-p2 — General settings in read-only mode show raw codes**
- Where: `views/settings-general/ui/SettingsGeneralView.tsx:21-26` shows the IANA zone (`America/Sao_Paulo`) and the currency code (`BRL`).
- Fix: show the localized zone name with its offset and the currency name (`Intl.DisplayNames`), as the edit widgets do.

**S-p3 — Invitations show an expiry for accepted or revoked rows**
- Where: `views/settings-invitations/ui/SettingsInvitationsView.tsx:67`.
- Fix: show "—" or the settled date for non-pending rows.

**S-p4 — The unit tree offers "Create child" under types that allow no children**
- Where: `features/manage-units/ui/UnitTreeEditor.tsx`, `SelectionBar`. The dialog then explains that no type is allowed and disables submit.
- Fix: hide or disable the button when `typesAllowedUnder(...)` is empty, and give the reason inline.

**S-p5 — Sections without detail pages accept any tail**
- Where: `app/apps/web/src/client/section-pages.tsx`, `SettingsSectionPage`. `/settings/members/whatever` renders Members.
- Fix: render NotFound when `rest` is non-empty for sections outside `SETTINGS_DETAIL_SECTIONS`.

**S-p6 — The knowledge upload dialog can be closed mid-upload**
- Where: `features/knowledge-upload/ui/AddKnowledgeDocumentDialog.tsx:198` (unguarded `onOpenChange`). Steps 1–3 run while `pending`.
- Fix: block dismissal while `pending`, or keep the upload going and show its progress as an ingestion notice.

**S-p7 — The "Run now" toast has no link to the run it started**
- Where: `features/schedule-editor/ui/ScheduleActionDialog.tsx` (`runQueued` toast).
- Fix: add a toast action "Ver execução" to the new `runId` (the API returns it).

**S-p8 — Knowledge collections fall back to raw ids**
- Where: `views/settings-knowledge/ui/KnowledgeDocumentsTable.tsx:24` (`projectNames.get(...) ?? collection.projectId`), and module collections use `moduleId`. Project names come only from the first projects page.
- Fix: resolve module names through the registry `labelKey`, and show "Projeto removido" when a project is not found.

**S-p9 — Experiment comparison sits below a long table, far from the "Comparar" toggles**
- Where: `views/settings-evals/ui/ExperimentsPanel.tsx` (`Comparison` rendered after `DataTable`).
- Fix: show a sticky compare bar ("2 selecionados · Comparar") that opens the comparison in a sheet, or render it above the table once two are picked.

**S-p10 — Approve runs at once while reject asks for confirmation**
- Where: `features/approval-decision/ui/ApprovalDecision.tsx:97` (approve, no confirmation) against the reject `ConfirmDialog`. The action summary is visible above, which is probably why. Separately, an approval whose execution fails ends with a generic `notify.error` (`:74`) and no reason or reference.
- Fix: keep approve one-click if that is deliberate, but show the execution failure inline with its code and request reference, not only as a toast.

## Counts

- blocker: 0
- major: 5
- minor: 19
- polish: 10
