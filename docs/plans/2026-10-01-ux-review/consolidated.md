# UX review — consolidated (agentic core boilerplate)

Branch `feat/agentic-app-core-sp0`, 2026-10-01. Read-only consolidation of four area reviews:
[`shell-auth-profile.md`](shell-auth-profile.md) (SH-*), [`chat.md`](chat.md) (C-*, P-*),
[`admin.md`](admin.md) (ADM-*), [`settings.md`](settings.md) (S-*). No code was edited.
Paths are relative to `app/packages/client/src/` unless they start with `app/`.

## Counts

| Severity | Source findings | Dropped | Consolidated findings |
|---|---|---|---|
| blocker | 1 | 0 | 1 |
| major | 18 | 0 | 17 |
| minor | 63 | 0 | 43 |
| polish | 39 | 0 | 21 |
| **total** | **121** | **0** | **82** |

A merged finding takes the highest severity of its sources (U-16 is major because S-M3 is; U-30
is minor because S-m12 is). 39 source findings were folded into cross-cutting findings.

## Verification (spot-check)

All 19 blocker/major source findings were checked against the code (S-M4 by sample). All held. **None dropped.**

| Finding | Evidence checked | Result |
|---|---|---|
| SH-01 | `app/apps/web/src/app/[locale]/(auth)/` has only `sign-in/page.tsx` and `invite/page.tsx`; `createUserWithEmailAndPassword` appears only in `app/packages/services/.../auth-emulator-rest.fixture.ts:16` | Confirmed |
| SH-02 | no `sendPasswordResetEmail` anywhere under `app/` | Confirmed |
| SH-03 | `features/mfa-enrollment/ui/EnrollTotpDialog.tsx:103-109`: link + setup key, no QR | Confirmed |
| SH-04 | `shared/ui/styles/modal-classes.ts:11-17`: no `max-h-*` / `overflow-y-auto` | Confirmed, with a nuance: some dialogs scroll their own form (`CreateApiKeyDialog.tsx:144`, `StartWorkflowRunDialog.tsx:92`, `max-h-[70vh] overflow-y-auto`). The TOTP form (`EnrollTotpDialog.tsx:98`) does not, so the issue stands at the kit level |
| SH-05 | `views/home/ui/HomeView.tsx:29-31` redirects unconditionally; `widgets/page-state/ui/PageState.tsx:38-51` `PageNotFound` offers only "go home" | Confirmed |
| SH-06 | only `app/apps/web/src/app/[locale]/not-found.tsx` exists; no `error.tsx` or `global-error.tsx` | Confirmed |
| SH-07 | `views/organizations/ui/OrganizationsView.tsx:77-85`: card rendered unconditionally | Confirmed |
| C-01 | `app-shell/app-layout.tsx:69` (`content: panelOpen ? <RightPanel /> : null`); `widgets/chat-panel/ui/project-chat-panel.tsx:35` passes no `onConversationChange` | Confirmed |
| C-02 | `shared/ui/molecules/Sheet/Sheet.tsx:60` (`absolute top-4 right-4`); `AppShellTemplate.tsx:77` and `views/chat/ui/chat-view.tsx:71` keep the default close button (only `Sidebar.tsx:41` opts out) | Confirmed in code (overlap itself is [inferred]: screenshot still advised) |
| C-03 | `features/chat-send/ui/chat-input.tsx:62` `canSend` has no phase; `widgets/chat-panel/ui/chat-composer.tsx:38` `blocked` covers uploads only; `chat-tool-part.tsx:36` interactive = latest message only | Confirmed |
| ADM-01 | `features/admin-prompt-version-editor/ui/PromptVersionDialog.tsx:120` passes `onOpenChange` straight through; no dirty guard | Confirmed |
| ADM-02 | `widgets/admin-kpi-cards/ui/AdminKpiCards.tsx:58` renders `percent(overview.tripwireRate)` like the others | Confirmed |
| ADM-03 | `views/admin-costs/ui/AdminCostsView.tsx:230` uses `useAllAdminOrganizations` | Confirmed |
| ADM-04 | `views/admin-evals/model/use-evals-url.ts:58-63` `setPage` clears compare; `ExperimentsPanel.tsx:66` resolves ids in the page only | Confirmed |
| S-M1 | `CreateApiKeyDialog.tsx:164` passes `onOpenChange` straight through; grep finds no `onEscapeKeyDown` / `onInteractOutside` / `onPointerDownOutside` anywhere in `src` | Confirmed |
| S-M2 | `views/settings-roles/ui/SettingsRolesView.tsx:119` (empty-state create not gated on catalog), `:128`, `:174` (`catalog.data ?? []`); `CreateApiKeyDialog.tsx:80-85` waits for pending but passes `[]` on error | Confirmed |
| S-M3 | `shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx:25,28` (`md:w-[220px]`, `max-w-[720px]`) | Confirmed (width impact is derived) |
| S-M5 | `features/start-workflow-run/ui/StartWorkflowRunDialog.tsx:41-43` (raw schema `<pre>`), `:117` (mono JSON textarea), `:106` (raw `workflow.id` as option label) | Confirmed |
| S-M4 | spot-checked through `StartWorkflowRunDialog.tsx:106` above | Confirmed (sample) |

Not checked: the SH-07 server flag beyond the cited client lines, and the S-M4 sites other than
the one sampled. Minor and polish findings were not re-verified.

## Overall verdict per area

| Area | Verdict | Why |
|---|---|---|
| **Shell, auth, profile** | **Not ready: blocker** | Strong kit (states, focus, i18n, toasts), but the entry funnel is broken. An invitee with no account cannot join (U-01). There is no password reset (U-04). A removed member loops on not-found (U-06). Server render errors bypass the design system (U-07). TOTP enrollment has no QR code (U-05). |
| **Chat** | **Good, targeted fixes needed** | The most complete area: 231 tests, rich states, accessibility done well. Three majors are about continuity and dead-ends: the side panel loses the thread (U-09), the sheet X overlaps "Nova conversa" (U-10), and an approval can be stranded (U-11). The rest is minor or polish. |
| **Admin console** | **Needs fix: data honesty** | Solid frame, URL state and confirmations. Two KPIs can mislead staff: the tripwire rate is never measured (U-12) and cost totals come from a capped list (U-13). The prompt editor loses text on Esc (U-02), and compare is limited to one page (U-14). Many raw ids. |
| **Tenant settings** | **Needs fix** | Wide coverage of states, but: one-time secrets are lost on Esc (U-02), the permission picker can be empty (U-15), tables are squeezed by the 720 px cap (U-16), workflows are labelled by raw ids (U-17), and workflow input is raw JSON (U-18). |
| **Cross-cutting kit** | **Fix once, fixes many** | Dialog dismissal and height (U-02, U-03), DataTable errors (U-19), URL state (U-26), offline (U-29), raw ids (U-17, U-31, U-33), type scale (U-62). |

## Consolidated findings

### Blocker

| ID | Finding | Sources | Main files |
|---|---|---|---|
| U-01 | No account can be created: an invitee without an account cannot accept, and there is no sign-up route and no staff provisioning | SH-01 | `views/invite/ui/InviteView.tsx:37-44`; `app/apps/web/src/app/[locale]/(auth)/`; `views/sign-in/ui/SignInView.tsx:17`; `app/apps/desktop/src/app/desktop-shell.tsx:26` |

### Major

| ID | Finding | Sources | Main files |
|---|---|---|---|
| U-02 | **Systemic: dialog dismissal is unguarded.** Esc, a click outside or the X discard one-time secrets (API key, invite link, device code) and unsaved work (prompt editor, plan form), and can close a dialog mid-upload. No `onEscapeKeyDown`/`onInteractOutside` guard exists in `src` | S-M1, ADM-01, S-p6 | `shared/ui/molecules/Dialog/Dialog.tsx`; `shared/ui/molecules/OneTimeSecret/OneTimeSecret.tsx:46`; `features/create-api-key/ui/CreateApiKeyDialog.tsx:164`; `features/invite-member/ui/InviteMemberDialog.tsx:165`; `features/create-device-activation/ui/CreateDeviceActivationDialog.tsx:127`; `features/admin-prompt-version-editor/ui/PromptVersionDialog.tsx:120`; `features/admin-update-plan/ui/PlanFormDialog.tsx:52`; `features/knowledge-upload/ui/AddKnowledgeDocumentDialog.tsx:198` |
| U-03 | Centered dialog has no max height or scroll, so tall dialogs (TOTP, SMS, change-password MFA) are cut off on phones and short windows | SH-04 | `shared/ui/styles/modal-classes.ts:11-17`; `features/mfa-enrollment/ui/EnrollTotpDialog.tsx:98` |
| U-04 | No password reset | SH-02 | `features/auth-by-email/ui/SignInForm.tsx:89-111`; `AuthPort`, `fake-auth.ts` |
| U-05 | TOTP enrollment has no QR code | SH-03 | `features/mfa-enrollment/ui/EnrollTotpDialog.tsx:99-109` |
| U-06 | `/` redirects to a stale `lastContext`, and "Go home" on not-found loops back to it | SH-05 | `views/home/ui/HomeView.tsx:13-31`; `widgets/page-state/ui/PageState.tsx:38-51`; `app/packages/services/.../membership-writes.ts:71-72` |
| U-07 | No `error.tsx` / `global-error.tsx`: server render errors show Next's English default page | SH-06 | `app/apps/web/src/app/[locale]/`, `app/apps/web/src/app/` |
| U-08 | The create-organization form is shown even when self-serve is off, so it always fails | SH-07 | `views/organizations/ui/OrganizationsView.tsx:77-85`; `features/create-organization/`; `GET /v1/me` contract |
| U-09 | The side-panel chat is unmounted on close and never learns its conversation id | C-01 | `app-shell/app-layout.tsx:69`; `widgets/chat-panel/ui/project-chat-panel.tsx:35` |
| U-10 | The sheet's close X overlaps "Nova conversa" in the chat panel and history sheets | C-02 | `shared/ui/molecules/Sheet/Sheet.tsx:60`; `shared/ui/templates/AppShellTemplate/AppShellTemplate.tsx:77`; `views/chat/ui/chat-view.tsx:71`; `widgets/chat-panel/ui/chat-panel.tsx:145-161`; `widgets/chat-history-sidebar/ui/chat-history-sidebar.tsx:103-112` |
| U-11 | The composer sends while an approval waits, and the stranded approval card is disabled with no reason | C-03 | `features/chat-send/ui/chat-input.tsx:62`; `widgets/chat-panel/ui/chat-composer.tsx:38-63`; `widgets/chat-panel/ui/chat-tool-part.tsx:36`; `features/chat-approval/ui/tool-confirmation.tsx:89,141-155` |
| U-12 | The overview shows the tripwire rate as measured (0 %) although it is never measured | ADM-02 (known #57) | `widgets/admin-kpi-cards/ui/AdminKpiCards.tsx:58` |
| U-13 | Cost KPIs, the alert list and the budgets are computed from a list capped at 2 000, with no indicator | ADM-03 | `views/admin-costs/ui/AdminCostsView.tsx:55-68,124,230`; `shared/api/cursor-list.ts:12-13`; `entities/admin-organization/api/admin-organization-queries.ts:38-46` |
| U-14 | Experiment comparison: admin can only compare within one page; in settings the comparison sits far below the toggles | ADM-04, S-p9 | `views/admin-evals/model/use-evals-url.ts:58-63`; `views/admin-evals/ui/ExperimentsPanel.tsx:64-67`; `views/settings-evals/ui/ExperimentsPanel.tsx`; `widgets/experiment-compare/` |
| U-15 | The role editor and API-key scopes show an empty permission picker when the catalog fails or is still loading | S-M2 | `views/settings-roles/ui/SettingsRolesView.tsx:119,128,174`; `features/create-api-key/ui/CreateApiKeyDialog.tsx:80-85`; `entities/role/ui/PermissionPicker.tsx` |
| U-16 | **Systemic: wide tables on mid-size screens.** Settings caps content at 720 px while tables of 6–9 columns switch to table layout at 768 px, so row actions end up offscreen. Admin "Uso por modelo" has no card mode | S-M3, ADM-13 | `shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx:25,28`; `shared/ui/organisms/DataTable/DataTable.tsx`; `views/settings-traces/ui/TraceList.tsx`; `views/settings-evals/ui/ExperimentsPanel.tsx:70`; `views/settings-api-keys/ui/SettingsApiKeysView.tsx`; `widgets/schedule-table/ui/ScheduleTable.tsx`; `views/settings-workflows/ui/RunsSection.tsx`; `views/admin-costs/ui/UsageBreakdown.tsx:112` |
| U-17 | **Systemic: machine ids and codes are the visible labels.** Workflow, schedule, experiment, flag, tool, command and module ids, approval ids, data keys, zone and currency codes, collection ids. The workflow catalog contract has no display name | S-M4, C-08, ADM-12, ADM-26, ADM-30, ADM-31, S-p2, S-p8 (+ flags part of S-m10) | `app/packages/contracts/src/contracts/workflows/workflow-catalog.schema.ts:10`; `views/settings-workflows/ui/RunsSection.tsx:30,40,102`; `RunPage.tsx:106`; `features/start-workflow-run/ui/StartWorkflowRunDialog.tsx:106`; `widgets/schedule-table/ui/ScheduleTable.tsx:85`; `widgets/run-timeline/ui/RunTimeline.tsx:49`; `views/settings-evals/ui/ExperimentsPanel.tsx:34`; `features/start-eval-experiment/ui/StartEvalExperimentDialog.tsx:57,63`; `views/settings-flags/ui/SettingsFlagsView.tsx:26`; `views/settings-agents/ui/AgentCard.tsx:35,80`; `features/custom-agent-editor/ui/CustomAgentFields.tsx:132`; `entities/message/ui/message-parts.tsx:67,84,107,136`; `features/generative-ui/ui/components/{schema-form-part,approval-pending-part,data-table-part,chart-part}.tsx`; `features/chat-approval/ui/tool-confirmation.tsx:86-87`; `views/admin-evals/ui/ExperimentsPanel.tsx:24`; `widgets/experiment-compare/ui/ExperimentCompare.tsx:42-43`; `views/admin-workflows/ui/RunsTable.tsx:37,51,55`; `features/admin-agent-enablement/ui/AgentEnablementPanel.tsx:156`; `features/admin-prompt-activation/ui/PromptEvalResultTable.tsx:19`; `views/settings-general/ui/SettingsGeneralView.tsx:21-26`; `views/settings-knowledge/ui/KnowledgeDocumentsTable.tsx:24` |
| U-18 | Starting and scheduling a workflow require hand-written JSON, with the JSON Schema printed as help | S-M5 | `features/start-workflow-run/ui/StartWorkflowRunDialog.tsx:41-43,117`; `features/schedule-editor/ui/ScheduleEditorDialog.tsx:171`; `shared/ui/organisms/SchemaForm` |

### Minor

| ID | Finding | Sources |
|---|---|---|
| U-19 | **Systemic:** `DataTable` errors ignore the error code (403 included), and retry shows no pending state. Seven copies of `statusOf` | SH-11, S-m1 |
| U-20 | **Impersonation awareness:** profile forms and the theme save stay live under read-only and always fail; the banner names nobody and scrolls away; the current session shows a raw uid | SH-08, SH-14, ADM-06 |
| U-21 | A 401 that survives refresh offers only "retry"; there is no sign-in-again action | SH-09 |
| U-22 | Form feedback: "Saved" stays visible while editing; submit is enabled when nothing changed; field errors persist after the fix | SH-10, ADM-22 |
| U-23 | **Systemic: toggle mutations without pending state or serialization.** Notification switch, organization switch, pin/archive, agent switches (rollback race) | SH-15, SH-16, C-10, S-m5 |
| U-24 | Sign-in and invite have no brand and no language picker (stuck on the OS locale on desktop) | SH-12 |
| U-25 | **Systemic: layout shift on load.** Full-screen spinner instead of a shell skeleton; admin page actions pop in; generative-UI skeleton height | SH-13, ADM-18, P-09 |
| U-26 | **Systemic:** filters, tabs, pickers and pages are component state in settings (and in admin impersonation sessions), so a reload or a shared link loses them | S-m4, ADM-08 |
| U-27 | **Systemic:** lists of running work (admin runs and experiments, tenant runs) never refresh | ADM-10, S-m8 |
| U-28 | **Systemic: risky one-click changes.** PII guardrail weakened, usage cap removed, instructions activated (disabled reason only in `title`); approve failure only shown as a toast | ADM-05, S-m14, S-m15, S-p10 |
| U-29 | **Offline:** confirm dialogs still submit after going offline; offline empty states say "no permission"; offline is announced three times in chat | ADM-27, S-m3, P-04 |
| U-30 | Flat navigation: 17 settings sections and 11 admin items, ungrouped | S-m12, ADM-33 |
| U-31 | Permission ids (`core.project.create`) shown instead of catalog labels, in chat approvals and settings approvals | C-07, S-m10 |
| U-32 | Silently capped or unpaginated lists: approvals stop at 300; prompt versions and activation history are unpaginated | S-m9, ADM-21 |
| U-33 | Raw cron in schedule tables (admin and settings); phone cards omit the last fire | S-m19, ADM-32 |
| U-34 | Dates: three time-zone rules on the console (hint only in `title`); minute precision for logs and traces | ADM-15, ADM-19 |
| U-35 | Test gaps: no colocated tests for `features/admin-*` and 6 widgets; axe matrix misses invite, MFA, not-found, open dialogs, banner, es-419 | ADM-28, SH-21 |
| U-36 | Settings not-found routing: a missing run shows a retryable error; bare `/settings` is a 404; unknown tails render the section | S-m6, S-m18, S-p5 |
| U-37 | Knowledge uploads block chat send and leave a stale chip | C-04 |
| U-38 | A failed "load earlier messages" is silent | C-05 |
| U-39 | Fenced code in answers has no copy button | C-06 |
| U-40 | The history count reflects only loaded rows | C-09 |
| U-41 | The open conversation's title is never shown; inconsistent naming (Chat / Assistente / Conversas) | C-11, P-06 |
| U-42 | Realtime voice errors and the "live" state are screen-reader only | C-12 |
| U-43 | A global `Ctrl+Space` steals the OS input-method switch | C-13 |
| U-44 | Chat height calc ignores the banners, giving a double scroll | C-14 |
| U-45 | Generative forms and pickers of older turns vanish or show no answer | C-15 |
| U-46 | Impersonation flow has no focus hand-off (select → form → open) | ADM-07 |
| U-47 | Start-impersonation: the organization error is not tied to its field, and the duration has no range hint | ADM-09 |
| U-48 | Admin run details are a modal that cannot be linked and has no trace or log links | ADM-11 |
| U-49 | An invalid usage range is shown as muted text, with nothing marked and no reset | ADM-14 |
| U-50 | The trace filter row does not wrap at `lg` | ADM-16 |
| U-51 | On `/admin/costs` the actionable list comes fourth and is unbounded | ADM-17 |
| U-52 | "Comparar" on a prompt version gives no visible result | ADM-20 |
| U-53 | Plan features are free-typed keys | ADM-23 |
| U-54 | The connector empty state and organization detail send staff in a circle | ADM-24 |
| U-55 | Expired flags are listed as one sentence, and the flag list cannot be filtered | ADM-25 |
| U-56 | Knowledge and Usage pages have no vertical spacing | S-m2 |
| U-57 | A failed run gives no reason and no next step | S-m7 |
| U-58 | The traces agent filter is free text that must be a kebab-case key | S-m11 |
| U-59 | A connector in "error" gives no reason; create does not lead to the secret step | S-m13 |
| U-60 | The agents page is very long and makes two requests per agent | S-m16 |
| U-61 | Knowledge ingestion notices are lost on reload | S-m17 |

### Polish

| ID | Finding | Sources |
|---|---|---|
| U-62 | **Systemic:** arbitrary font sizes (`text-[11.5px]`, `text-[12.5px]`, `text-[13px]`, 65 + 56 + ~160 uses counted per area, with overlap in shared UI) outside the type scale. Add `@theme` tokens and record them in DESIGN.md | P-01, ADM-37, S-p1 |
| U-63 | Unit picker opens to the right on mobile | SH-17 |
| U-64 | Profile nav duplicates the `user-menu` registry | SH-18 |
| U-65 | Page `h1` can overflow with long names | SH-19 |
| U-66 | The TOTP issuer is the Firebase project id | SH-20 |
| U-67 | Unused AI kit ports (`chain-of-thought`, `plan`, `queue`, `context`) | P-02 |
| U-68 | "Nova conversa" appears twice, and the two behave differently | P-03 |
| U-69 | The placeholder equals the button name; the keyboard hint shows on touch | P-05 |
| U-70 | Weak empty-state actions (chat not-found, admin organizations, admin traces) | P-07, ADM-35 |
| U-71 | Suggestion cards send at once, with no chance to edit | P-08 |
| U-72 | No elapsed time while recording voice (60 s cap) | P-10 |
| U-73 | Regenerate discards the previous answer | P-11 |
| U-74 | No paste or drag-and-drop for attachments | P-12 |
| U-75 | A partial answer on error is not marked | P-13 |
| U-76 | Sent attachments cannot be opened | P-14 |
| U-77 | Overview KPI cards are not links | ADM-29 |
| U-78 | The "Staff" badge appears twice | ADM-34 |
| U-79 | The admin placeholder page uses a different header | ADM-36 |
| U-80 | Invitations show an expiry on settled rows | S-p3 |
| U-81 | "Create child" is offered under leaf unit types | S-p4 |
| U-82 | The "Run now" toast has no link to the run | S-p7 |

## Prioritized fix list (independent batches)

Batches are grouped so each one can land as its own PR. Where two batches touch the same file,
it is listed under **Shared files**: land the earlier batch first, or rebase.

### P0: ship-blocking

**B1 — Kit dialogs (dismissal guard and height)**: U-02, U-03
- Files: `shared/ui/molecules/Dialog/Dialog.tsx`, `shared/ui/styles/modal-classes.ts`,
  `shared/ui/molecules/OneTimeSecret/OneTimeSecret.tsx`, `features/create-api-key/ui/CreateApiKeyDialog.tsx`,
  `features/invite-member/ui/InviteMemberDialog.tsx`, `features/create-device-activation/ui/CreateDeviceActivationDialog.tsx`,
  `features/admin-prompt-version-editor/ui/PromptVersionDialog.tsx`, `features/admin-update-plan/ui/PlanFormDialog.tsx`,
  `features/knowledge-upload/ui/AddKnowledgeDocumentDialog.tsx`.
- Approach: one guard in the kit (a `dismissible`/`confirmDiscard` prop on `DialogContent`, or a
  `useGuardedDialog` hook); a body that scrolls with a sticky footer. Add tests: Esc before
  acknowledgement keeps the dialog open; a 360×640 e2e of the TOTP dialog.

**B2 — Auth entry and onboarding**: U-01, U-04, U-08, U-24
- Files: `views/invite/`, `features/accept-invitation/`, `views/sign-in/ui/SignInView.tsx`,
  `features/auth-by-email/ui/SignInForm.tsx`, new `views/reset-password` (and `sign-up` behind the
  flag), the `AuthPort` and `fake-auth.ts`, `app/apps/web/src/app/[locale]/(auth)/`,
  `app/apps/desktop/src/routes/` + `desktop-shell.tsx:26`, `shared/ui/templates/AuthTemplate/`,
  `views/organizations/ui/OrganizationsView.tsx`, `features/create-organization/`, the `Me`
  contract (`capabilities.createOrganization`), and i18n `auth.json` in all three locales.
- Needs an ADR under `app/docs/decisions/` for sign-up policy and the self-serve capability.

**B3 — Error, session and not-found recovery**: U-06, U-07, U-21, U-36
- Files: `views/home/ui/HomeView.tsx`, `widgets/page-state/ui/PageState.tsx`, `QueryPage.tsx`,
  `QuerySection.tsx`, `shared/ui/molecules/ErrorState/ApiErrorState.tsx`, `shared/api/http-client.ts`,
  `app/apps/web/src/app/[locale]/error.tsx` (new), `app/apps/web/src/app/global-error.tsx` (new),
  the settings index route (web and desktop), `app/apps/web/src/client/section-pages.tsx`,
  `views/settings-workflows/ui/RunPage.tsx`, `entities/workflow-run/api/tenant-workflow-run-queries.ts`;
  server: `GET /v1/me` `lastContext` validation (`app/packages/services/.../access`).

### P1: major fixes per area

**B4 — Profile security and impersonation**: U-05, U-66, U-20, U-46, U-47
- Files: `features/mfa-enrollment/ui/EnrollTotpDialog.tsx`, `shared/config/client-config.schema.ts`,
  `widgets/impersonation-banner/`, `app-shell/app-layout.tsx` (banner placement),
  `features/update-preferences/` (theme and notifications), `views/profile-account`, `views/profile-preferences`,
  `features/admin-impersonation/ui/{OpenImpersonationSession,StartImpersonationForm}.tsx`,
  `views/admin-users/ui/{UserSearchSection,AdminUsersView}.tsx`, `widgets/admin-org-filter`
  (`invalid`/`describedBy` props).
- Shared files: `app-shell/app-layout.tsx` with B5 (U-09, U-44);
  `NotificationPreferencesForm.tsx` with B11 (U-23).

**B5 — Chat continuity and approvals**: U-09, U-10, U-11, U-37, U-38, U-41, U-44, U-45, U-68
- Files: `app-shell/app-layout.tsx`, `widgets/chat-panel/ui/{project-chat-panel,chat-panel,chat-composer,chat-tool-part}.tsx`,
  `widgets/chat-panel/model/use-older-messages.ts`, `features/chat-send/ui/chat-input.tsx`,
  `features/chat-approval/ui/tool-confirmation.tsx`, `features/chat-upload/model/upload-queue.ts`,
  `features/generative-ui/ui/components/{schema-form-part,picker-part}.tsx`, `views/chat/ui/chat-view.tsx`,
  `widgets/chat-history-sidebar/ui/chat-history-sidebar.tsx`, `shared/ui/templates/AppShellTemplate/AppShellTemplate.tsx`.
- First verify what `/v1/chat` does with a turn sent past an unanswered approval (C-03 noted it is untested).

**B6 — Admin data honesty and evals compare**: U-12, U-13, U-14, U-32, U-51
- Files: `widgets/admin-kpi-cards/ui/AdminKpiCards.tsx`, the `AdminOverview` contract (`unmeasured`),
  `shared/api/cursor-list.ts` (`{ items, truncated }`), `views/admin-costs/ui/AdminCostsView.tsx`,
  `views/admin-evals/model/use-evals-url.ts`, `views/admin-evals/ui/ExperimentsPanel.tsx`,
  `views/settings-evals/ui/ExperimentsPanel.tsx`, `widgets/experiment-compare/`,
  `entities/approval-request/api/approval-request-queries.ts`, `views/settings-approvals/ui/ApprovalsInbox.tsx`,
  `views/admin-agent-prompts/ui/{PromptVersionsTable,PromptActivationHistory}.tsx`.
- Server: a get-experiment-by-id endpoint (or `?ids=`).

**B7 — Settings correctness**: U-15, U-18, U-57, U-59, U-61
- Files: `entities/role/ui/PermissionPicker.tsx`, `views/settings-roles/ui/SettingsRolesView.tsx`,
  `features/create-api-key/ui/CreateApiKeyDialog.tsx`, `features/start-workflow-run/ui/StartWorkflowRunDialog.tsx`,
  `features/schedule-editor/ui/ScheduleEditorDialog.tsx`, `shared/ui/organisms/SchemaForm` (JSON-Schema adapter),
  `widgets/run-timeline/`, `views/settings-workflows/ui/RunPage.tsx`, `features/connector-editor/ui/ConnectorEditorDialog.tsx`,
  `views/settings-connectors/ui/SettingsConnectorsView.tsx`, `views/settings-knowledge/ui/SettingsKnowledgeView.tsx`.
- Contracts and ADR: run `failure { code, messageKey }`, connector `lastError`.
- Shared files: `CreateApiKeyDialog.tsx` with B1; `StartWorkflowRunDialog.tsx` with B9 (option
  labels); `RunPage.tsx` with B3. Land B1 and B3 first.

**B8 — Tables and settings layout**: U-16, U-19, U-56
- Files: `shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx` (`width="wide"`, default gap),
  `shared/ui/organisms/DataTable/DataTable.tsx` (`error: unknown`, `retrying`, `ApiErrorState`, card
  breakpoint), a shared `dataTableStatusOf(query)` helper, and every caller (`settings-members`,
  `-invitations`, `-roles`, `-api-keys`, `-devices`, `-knowledge`, `-connectors`, `profile-sessions`),
  `views/admin-costs/ui/UsageBreakdown.tsx` (`renderCard`), `widgets/schedule-table/` (row actions → menu),
  `views/settings-usage/ui/SettingsUsageView.tsx`.
- Confirm with Playwright screenshots at 768 and 1280 px.

**B9 — Human-readable labels**: U-17, U-31, U-33
- Files: workflow catalog, tool and flag contracts (`labelKey`), plus an ADR under `app/docs/decisions/`;
  i18n (`chat.tools.*`, `workflows.names.*`, flag labels); a shared `usePermissionLabel` from
  `permissions.json`; the view files listed under U-17; `widgets/schedule-table/ui/ScheduleTable.tsx`
  with a cron describer reusing `features/schedule-editor/model/cron-presets.ts`.
- Shared files: `ScheduleTable.tsx` with B8; `StartWorkflowRunDialog.tsx` with B7.

### P2: cross-cutting minors and polish

**B10 — Admin UX minors**: U-48, U-49, U-50, U-52, U-53, U-54, U-55, U-77, U-78, U-79, U-70 (admin part)
- Files: `views/admin-workflows/`, `views/admin-costs/ui/UsageBreakdown.tsx`, `views/admin-traces/ui/TraceFilters.tsx`,
  `views/admin-agent-prompts/`, `features/admin-update-plan/model/plan-form.contract.ts`,
  `views/admin-connectors/`, `views/admin-organization-detail/`, `views/admin-flags/`,
  `widgets/admin-kpi-cards/`, `views/admin-overview/`, `views/admin-slot/`, `views/admin-organizations/`.

**B11 — Shared state patterns**: U-22, U-23, U-26, U-27, U-28, U-29
- Files: `shared/ui/organisms/SchemaForm/`, `features/admin-update-organization/ui/BudgetOverrideForm.tsx`,
  `features/update-preferences/ui/NotificationPreferencesForm.tsx`, `features/switch-organization/`,
  `widgets/organization-switcher/`, `features/chat-history/`, `features/tenant-agent-settings/`,
  the settings route `search` param (`route-paths.ts`) and the settings views listed in S-m4,
  `views/admin-users/ui/ImpersonationSessionsSection.tsx`, the run and experiment queries (`refetchInterval`),
  `features/admin-agent-enablement/`, `features/set-usage-cap/`, `features/tenant-prompt-addendum/`,
  `features/approval-decision/`, `shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx`,
  the settings views with an `onCreate` offline check, `widgets/chat-panel/ui/status-line.tsx`.

**B12 — Chat polish**: U-39, U-40, U-42, U-43, U-67, U-69, U-70 (chat part), U-71–U-76
- Files: `shared/lib/markdown/safe-markdown.tsx`, `features/chat-voice/`, `features/chat-upload/`,
  `widgets/chat-panel/`, `entities/message/ui/message-parts.tsx`, `shared/ui/ai/`, `chat.json` (all locales).

**B13 — Settings and shell polish**: U-30, U-34, U-58, U-60, U-63, U-64, U-65, U-80, U-81, U-82
- Files: `app-shell/navigation/core-navigation.ts`, `widgets/settings-nav/`, `widgets/admin-sidebar/`,
  `app/packages/i18n/src/format/date-time.ts` (`precise` style), `views/admin-traces/`, `views/admin-logs/`,
  `views/settings-traces/ui/TraceFilters.tsx`, `views/settings-agents/`, `widgets/unit-picker/`,
  `widgets/profile-nav/`, `widgets/page-header/`, `views/settings-invitations/`, `features/manage-units/`,
  `features/schedule-editor/ui/ScheduleActionDialog.tsx`.

**B14 — Type scale, loading skeletons and tests**: U-62, U-25, U-35
- Files: `shared/ui/styles/globals.css` (`@theme` text tokens), `.design-system/DESIGN.md`, and every
  file with `text-[Npx]` (mechanical replace; land it last to avoid conflicts);
  `app/apps/web/src/client/shell-skeleton.tsx`, `app/apps/desktop/src/app/desktop-shell.tsx`,
  `widgets/admin-nav/ui/AdminPageFrame.tsx`, `features/generative-ui/ui/generative-part.tsx`;
  new colocated tests for `features/admin-*` and the 6 widgets; `app/apps/web/e2e/a11y.spec.ts`.

## Known items not re-counted

From `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`: #45, #46, #47, #48, #52, #56, #57
(UI consequence counted as U-12), #85, #86, #91, #92.
