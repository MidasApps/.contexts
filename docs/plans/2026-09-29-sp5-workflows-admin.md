# SP5 — Workflows, `/admin` and tenant `/settings`: implementation plan

> **For agentic workers:** Use skill `using-ddc` before coding. Subagent-per-task with the
> templates in `.claude/skills/writing-plans-ddc/` (implementer + task-reviewer). Read
> `docs/plans/execution-constraints.md` first: **`.contexts/` and `.claude/` are read-only**.
> Progress: `docs/plans/2026-09-29-sp5-workflows-admin/progress.md`; reports:
> `docs/plans/2026-09-29-sp5-workflows-admin/reports/task-<N>.md`.

**Goal:** HITL and scheduled workflows with an approvals inbox and streaming progress; the
staff console `/admin` and tenant `/settings` for agents, prompts, connectors,
datasets/experiments/evals, traces/logs, costs and flags; and the final proof that the
umbrella success criterion §1 holds.

**Architecture:** workflows in `@core/agents` on Mastra (suspend/resume, Schedules), APIs
in `@core/services` behind `/v1` (gateway to the private Mastra), UI in `@core/client`
views composed by `apps/web/src/app/{admin,(app)/settings}`. Design:
`docs/superpowers/specs/2026-09-29-sp5-workflows-admin-design.md` ("spec"); SP3/SP4 specs;
umbrella §9, §10, §13.

**Tech Stack:** as SP3/SP4 plans (MEMORY pins + measurements of 2026-09-29): `@mastra/core`
1.71.0 (workflows, schedules, datasets), `@mastra/client-js` 1.50.0, `firebase-admin` 14.5.0
(Remote Config), `@google-cloud/bigquery` 9.1.0, `croner` (measure; used for next-fire
preview and interval checks, same engine as Mastra), Next 16.3.7, React 19.3.0,
`recharts` 3.10.1, Playwright 1.63.0.

## Global Constraints

- Same as SP3 plan "Global Constraints" (framework read-only + `framework-ok`, PATH export,
  `WEB_PORT=3100`, pins via `catalog:` after `npm view`, `AI_MODE=fake` in every test,
  handler order, envelope, tenancy, sizes, commits) and SP4 client rules (FSD, Atomic,
  i18n keys in 3 locales, WCAG 2.2 AA, tokens from `.design-system/DESIGN.md`).
- Prerequisites: SP3 and SP4 gates green.
- `/admin/**` and `/v1/admin/**`: staff principal with MFA (SP1) checked in the layout **and**
  every handler; every staff mutation → `platform-audit-logs` with `targetTenantId`.
- Tenant endpoints never take a tenant id from the path/body; they use the active tenant.
- Governance: `@.contexts/engineering/rules/governance.md` (prompts, flags, cost gates,
  HITL) is binding for Tasks 5, 7, 8, 9.
- Commit scopes: `workflows`, `admin`, `agents`, `services`, `contracts`, `client`, `web`,
  `usage`, `chat`, `i18n`, `ci` (flags live in `services`).

---

### Task 0: Record SP5 decisions

**Contexts:** spec §9; `app/docs/decisions/` (format)

**Files:** Create `app/docs/decisions/NNNN-*.md` for D5-01…D5-08 (≤ 6 files).

- [ ] Steps: read → write ADRs → progress → commit `docs(workflows): record workflow and admin decisions`

**Verify:** every D5 id in exactly one ADR; `framework-ok`.

### Task 1: SP5 contracts

**Contexts:** spec §3–§8; `@.contexts/engineering/contracts/schemas.md`

**Files:**
- Create in `app/packages/contracts/src/contracts/`: `workflows/{approval.schema.ts (projection),approval-decision.schema.ts,schedule.schema.ts (cron, IANA timezone, inputData unknown validated server-side),workflow-run.schema.ts,workflow-event.schema.ts}`, `agents/{prompt-version.schema.ts,prompt-activation.schema.ts}`, `platform/{plan.schema.ts,feature-flag.schema.ts,admin-overview.schema.ts}`, `observability/{trace-summary.schema.ts,trace-detail.schema.ts,eval-experiment-summary.schema.ts}`, `usage/usage-daily-rollup.schema.ts`, `conversations/message-feedback.schema.ts`
- Modify: `composition.ts`, `index.ts`; `pnpm contracts:catalog`
- Test: schema tests (cron 5 fields only; timezone must be IANA; plan limits non-negative integers; flag requires owner and future `expiresAt`)

- [ ] Steps: read → failing tests → implement → PASS + `contracts:check` → progress → commit `feat(contracts): add workflow, approval, prompt, plan, flag and trace contracts`

**Verify:** `pnpm -F @core/contracts test && pnpm contracts:check`; `framework-ok`.

### Task 2: `approval-request` workflow and real `ApprovalPort`

**Contexts:** spec §3.3, D5-01; umbrella §4 (`requiresApproval`), §16.2 (four eyes), §16.4; SP3 `define-core-tool.ts`, `runtime-ports.ts`

**Files:**
- Create: `app/packages/agents/src/workflows/approval-request.workflow.ts` (steps of spec §3.3; `suspendSchema`, `resumeSchema`; four-eyes and permission checks at resume; re-suspend on invalid decider; execute as requester with stored idempotency key; `retryConfig` 3 on `execute-action` only for transient errors)
- Create: `app/apps/mastra/src/runtime/approval-port-adapter.ts` (starts the workflow via `mastra.getWorkflow('approval-request').createRun({ resourceId }).startAsync(...)`, returns `{ status: 'pending', approvalId: runId }`); bind in `create-runtime-ports.ts` (replaces the SP3 fail-closed adapter)
- Test: `approval-request.workflow.postgres.test.ts` (fake ports: requester cannot approve own request; approver without action permission → re-suspend + 403 code; approve executes command once even with two concurrent resumes (`WORKFLOW_RESUME_ALREADY_CLAIMED`); reject executes nothing; expired → outcome `expired`; requester lost grant before approval → `FORBIDDEN` outcome); `define-core-tool.test.ts` updated (pending result shape)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(workflows): add four-eyes approval workflow`

**Verify:** `pnpm -F @core/agents test && pnpm -F @core/agents test:postgres`; `framework-ok`.

### Task 3: Approvals projection, inbox API and notifications

**Contexts:** spec §3.3, §3.4; `@.contexts/engineering/contracts/firebase-firestore.md`; SP1 notifications/audit exports

**Files:**
- Create: `app/packages/services/src/services/approvals/{application/use-cases/{project-approval.ts,list-approvals.ts,get-approval.ts,decide-approval.ts,create-generic-approval.ts},adapters/driven/firestore-approval-repository.ts,adapters/driving/approvals-route-handler.ts}` (the `notify-approvers`/`record-outcome` steps call `project-approval` through a runtime port)
- Create: `app/apps/web/src/app/v1/approvals/route.ts`, `[approvalId]/route.ts`, `[approvalId]/decision/route.ts`
- Modify: `app/firestore.rules` (`approvals` readable by `requestedBy` and `approverUids` of the same tenant; no client writes), `app/firestore.indexes.json`
- Test: handler tests (approver sees pending; requester sees own; outsider 404; decision by requester → 403; decision forwards to gateway `resumeWorkflow`; transaction guards `status == pending`), rules emulator test

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(workflows): add approvals inbox api`

**Verify:** `pnpm -F @core/services test && pnpm test:emulators`; `framework-ok`.

### Task 4: Workflow runs API and SSE progress

**Contexts:** spec §3.6, D5-07; `@.contexts/engineering/contracts/api.md` §14

**Files:**
- Create: `app/packages/services/src/services/workflows/{application/use-cases/{list-runs.ts,get-run.ts,cancel-run.ts,start-run.ts},adapters/driving/{workflow-runs-route-handler.ts,workflow-run-stream-route-handler.ts},adapters/driven/workflow-event-sse.ts}`
- Create: `app/apps/web/src/app/v1/workflows/runs/**/route.ts`, `v1/workflows/[workflowId]/runs/route.ts` (start, only `startable: true` workflows)
- Modify: `app/packages/agents/src/chat/chat-routes.ts` (register `workflowRoute` v7 for workflows started from chat so `data-workflow` parts render)
- Test: SSE encoder (`event: data|done|error`, one JSON line, `Last-Event-Id` resumes from event index), handler tests (tenant scoping by `resourceId` prefix; other tenant's run → 404; cancel → 204), integration with the fake-mode Mastra (`knowledge-ingest` run streams step events)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(workflows): add workflow runs api with sse progress`

**Verify:** `pnpm -F @core/services test -- workflows && pnpm test:emulators`; `framework-ok`.

### Task 5: Schedules (platform declarative + tenant CRUD)

**Contexts:** spec §3.5, D5-02; umbrella §6 (time zone), §16.3 (scheduler host); `@.contexts/engineering/rules/internationalization.md` (time zones)

**Files:**
- Modify: core workflows add `schedule` (UTC) per spec §3.2 (`catalog-reindex`, `usage-report`, `approval-expiry-sweep`, `conversation-purge`, `eval-export`)
- Create: `app/packages/agents/src/workflows/steps/reauthorize-schedule-creator.step.ts` (first step of every `schedulable` workflow)
- Create: `app/packages/services/src/services/workflows/{application/use-cases/{create-schedule.ts,update-schedule.ts,pause-schedule.ts,resume-schedule.ts,run-schedule-now.ts,delete-schedule.ts,list-schedules.ts},domain/schedule-policy.ts,adapters/driving/schedules-route-handler.ts}` (policy: 5-field cron, IANA zone required, min interval 15 min — `SCHEDULE_MIN_INTERVAL_MINUTES` env, default 15, allowed down to 1 only when `APP_ENV=local`; ids `schedule_<tenantId>_<slug>`; `inputData` validated by the workflow schema through the gateway)
- Create: `app/apps/web/src/app/v1/schedules/**/route.ts`
- Test: `schedule-policy.test.ts` (`0 9 * * *` in `America/Sao_Paulo` next fires across DST-less and DST zones e.g. `America/New_York` computed with Croner; `* * * * *` rejected in prod config), handler tests (non-schedulable workflow 422; foreign schedule 404), `scheduler.postgres.test.ts` (Mastra with scheduler on, local 1-min policy, `schedules.run(id)` produces a run with the schedule's `requestContext`; creator without permission → run `FORBIDDEN` and schedule paused + notification port called)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(workflows): add tenant schedules with time zones`

**Verify:** `pnpm -F @core/services test -- schedule && pnpm -F @core/agents test:postgres`; `framework-ok`.

### Task 6: Usage report workflow, rollups, BigQuery export and budget alerts

**Contexts:** spec §3.2, D5-05, D5-06; `@.contexts/engineering/contracts/bigquery.md` §9, §10, §14; `@.contexts/engineering/rules/governance.md` ("Custo")

**Files:**
- Create: migration `usage.daily_rollups(tenant_id, day date, model, agent_id, input_tokens, output_tokens, cost_micro_usd, calls, primary key(tenant_id, day, model, agent_id))`
- Create: `app/packages/agents/src/workflows/usage-report.workflow.ts` (`.foreach` tenants with concurrency 4; idempotent upsert; export through `UsageSink` with `insertId`; alerts at 80 % and 100 % once per month per tenant via notification port; audit)
- Create: `app/infra/bigquery/ai_observability.sql` (DDL for `llm_calls`, `daily_rollups`, `eval_runs`: partition by `DATE(occurred_at)`/`day`, cluster `tenant_id, model`, `require_partition_filter`) and `app/infra/bigquery/README.md` (apply with `bq query --use_legacy_sql=false` in each env; not run locally)
- Test: workflow postgres test (two tenants, rerun is idempotent, alert sent once at 80 %), BigQuery sink mapping test with fake client

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(usage): add usage report workflow with rollups and alerts`

**Verify:** `pnpm -F @core/agents test:postgres && pnpm -F @core/services test -- usage`; `framework-ok`.

### Task 7: Expiry sweep, conversation purge and eval export workflows

**Contexts:** spec §3.2; SP4 `conversations` context; SP3 eval runner output

**Files:**
- Create: `app/packages/agents/src/workflows/{approval-expiry-sweep.workflow.ts,conversation-purge.workflow.ts,eval-export.workflow.ts}`
- Create: `app/packages/services/src/services/conversations/application/use-cases/purge-deleted-conversations.ts`
- Test: sweep resumes only expired pending runs; purge deletes conversations soft-deleted > 30 days (Firestore + Mastra thread) and nothing newer; eval export maps experiment summaries to `eval_runs` rows (fake sink)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(workflows): add expiry sweep, conversation purge and eval export`

**Verify:** `pnpm -F @core/agents test:postgres && pnpm test:emulators`; `framework-ok`.

### Task 8: Feature flags (`FlagsPort`) and AI kill-switch

**Contexts:** spec §5, D5-04; `@.contexts/engineering/rules/governance.md` ("Feature flags"); `@.contexts/engineering/stacks/backend/firebase-functions.md` (admin SDK)

**Files:**
- Create: `app/packages/services/src/services/flags/{flag-registry.ts,application/use-cases/{get-flags.ts,set-flag-value.ts,list-flags.ts},adapters/driven/{remote-config-flags.ts,firestore-flags.ts},adapters/driving/{flags-route-handler.ts,admin-flags-route-handler.ts}}` (+ `v1/flags`, `v1/admin/flags` routes)
- Modify: `app/packages/agents/src/runtime/runtime-ports.ts` (`FlagsPort`), context middleware: `ai.kill-switch` on → 503 `FEATURE_DISABLED` for agent/chat routes; `chat.voice.realtime`, `ai.web-tools`, `ai.memory.observational` read through the port (cached 30 s)
- Test: registry test (every flag has owner, reason, `expiresAt`, kind; expired flags listed), adapter tests (Remote Config with fake client; Firestore in emulator), kill-switch middleware test

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(services): add feature flags with ai kill-switch`

**Verify:** `pnpm -F @core/services test && pnpm -F @core/agents test && pnpm test:emulators`; `framework-ok`.

### Task 9: Prompt store with eval-gated activation

**Contexts:** spec §4, D5-03; `@.contexts/engineering/rules/governance.md` ("Governança de IA generativa"); SP3 `load-instructions.ts`, eval runner

**Files:**
- Create: migration `agents.prompt_versions`, `agents.prompt_activations` (RLS for tenant scope), `app/scripts/src/seed/import-prompt-seeds.ts` (code seeds → version 1, idempotent)
- Create: `app/packages/services/src/services/agents/application/use-cases/{create-prompt-version.ts,run-prompt-eval.ts,activate-prompt-version.ts,list-prompt-versions.ts}`, `adapters/driven/postgres-prompt-repository.ts`, route handlers for `/v1/admin/agents/{id}/prompt-versions|activations` and `/v1/agents/{id}/prompt-addendum/*` (tenant)
- Modify: `app/packages/agents/src/agents/load-instructions.ts` (active platform version → seed fallback; tenant addendum in a delimited section; 60 s cache; request-context override `promptVersionId` only for experiments started by `run-prompt-eval`)
- Test: every write creates a version (no update path); activation without passing experiment → 409 `EVAL_REQUIRED`; staff force requires reason + audit; rollback = new activation row; tenant addendum cannot replace platform text; RLS isolates tenant addenda

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(agents): add versioned prompt store with eval-gated activation`

**Verify:** `pnpm test:postgres && pnpm -F @core/services test && pnpm -F @core/agents test`; `framework-ok`.

### Task 10: Plans, organizations admin, budgets and agent settings APIs

**Contexts:** spec §6 (organizations, plans, agents, costs), D5-05; SP1 organizations/staff exports; SP3 `usage` and `agents.AgentSettings`

**Files:**
- Create: `app/packages/services/src/services/platform/{application/use-cases/{list-plans.ts,upsert-plan.ts,list-organizations-admin.ts,update-organization-admin.ts,get-admin-overview.ts},adapters/driving/admin-platform-route-handler.ts}`
- Create: `app/packages/services/src/services/agents/application/use-cases/{get-agent-settings.ts,update-agent-settings.ts}` + handlers for `/v1/agent-settings` (tenant) and `/v1/admin/organizations/{id}/agent-settings`, `/v1/admin/organizations/{id}/budget`
- Create: routes under `app/apps/web/src/app/v1/admin/**` and `v1/agent-settings`
- Modify: SP3 `budget-policy.ts` reads plan limits + staff override
- Test: staff-only (non-staff 403, staff without MFA 403), platform audit written with `targetTenantId`, budget change reflected by `checkTenantBudget`, tenant cannot raise its own cap above the plan

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(admin): add plans, organization, budget and agent settings apis`

**Verify:** `pnpm -F @core/services test -- admin agent-settings`; `framework-ok`.

### Task 11: Traces, evals and feedback APIs

**Contexts:** spec §8, D5-06; SP3 observability (`requestContextKeys`, `SensitiveDataFilter`), datasets/experiments

**Files:**
- Create: `app/packages/services/src/services/observability/{application/use-cases/{list-traces.ts,get-trace.ts},adapters/driven/mastra-traces-reader.ts,adapters/driving/traces-route-handler.ts}` (`/v1/traces` tenant-filtered; `/v1/admin/traces` staff, optional tenant filter)
- Create: `app/packages/services/src/services/evals/{application/use-cases/{list-datasets.ts,get-dataset.ts,add-dataset-items.ts,start-experiment.ts,list-experiments.ts,compare-experiments.ts},adapters/driving/evals-route-handler.ts}` (`/v1/evals/*` tenant datasets; `/v1/admin/datasets|experiments`)
- Create: `app/packages/services/src/services/conversations/application/use-cases/record-message-feedback.ts` + `POST /v1/conversations/{id}/feedback` (thumbs, comment ≤ 1000; optional add to tenant dataset `feedback`)
- Create: `app/scripts/evals-publish.ts` (`pnpm evals:publish`: uploads `app/.evals/*.json` as experiments when `EVALS_TARGET_URL` is set; no-op otherwise)
- Modify: SP4 message actions (`@core/client` `entities/message`) add thumbs up/down calling the endpoint
- Test: tenant A never sees tenant B traces (filter applied server-side even if the query asks otherwise); span I/O fields with sensitive pii dropped; experiment start validates agent enabled for tenant; feedback idempotent per (message, user)

- [ ] Steps: read → failing tests → implement → PASS → progress → commit `feat(admin): add traces, evals and feedback apis`

**Verify:** `pnpm -F @core/services test -- traces evals feedback && pnpm test:emulators`; `framework-ok`.

### Task 12: `/admin` UI — shell, overview, organizations, plans, users, agents, prompts

**Contexts:** spec §6, D5-08; SP2 shell/templates, `DataTable`, `SchemaForm`; `.design-system/DESIGN.md`; `@.contexts/engineering/rules/{accessibility,internationalization}.md`; `@.contexts/engineering/architecture/fsd.md`

**Files:**
- Create: `app/packages/client/src/views/admin-{overview,organizations,organization-detail,plans,users,agents,agent-prompts}/**`, `src/widgets/admin-{nav,kpi-cards,prompt-diff}/**`, `src/features/admin-{update-plan,update-organization,agent-enablement,prompt-version-editor,prompt-activation}/**`
- Create: `app/apps/web/src/app/admin/layout.tsx` (server: staff + MFA via session cookie → redirect to login/403), `app/apps/web/src/app/admin/{page.tsx,organizations/**,plans/**,users/**,agents/**}` (composition only)
- Modify: i18n `admin.*` keys in 3 locales
- Test: component tests (KPI cards format money with `Intl` and tabular nums; prompt diff; activation button disabled until eval passed; impersonation banner visible while active)

- [ ] Steps: read → failing tests → implement → PASS → `pnpm -F web build` → progress → commit `feat(admin): add admin console for organizations, plans, users and agents`

**Verify:** `pnpm -F @core/client test -- admin && pnpm -F web build`; `framework-ok`.

### Task 13: `/admin` UI — connectors, evals, traces, logs, costs, workflows, flags

**Contexts:** spec §6, §8; `.contexts/engineering/rules/observability.md`; dataviz via shadcn chart (recharts)

**Files:**
- Create: `app/packages/client/src/widgets/{trace-viewer,cost-charts,experiment-compare,schedule-table,run-timeline}/**` (shared by `/settings`), `src/views/admin-{connectors,evals,traces,trace-detail,logs,costs,workflows,flags}/**`
- Create: `app/apps/web/src/app/admin/{connectors,evals,traces,logs,costs,workflows,flags}/**/page.tsx`
- Create: `app/packages/services/src/services/platform/adapters/driving/admin-logs-route-handler.ts` (local only: ring buffer of the last 500 structured log lines from web and Mastra via the shared logger sink; remote → 404 and the UI shows a Cloud Logging deep link built from `trace_id`)
- Test: trace viewer renders span tree with tokens/cost per span and collapses tool I/O; costs chart totals equal API totals; workflows page lists suspended approvals and supports cancel/run-now; flags page warns on expired flags

- [ ] Steps: read → failing tests → implement → PASS → `pnpm -F web build` → progress → commit `feat(admin): add traces, costs, evals, workflows and flags pages`

**Verify:** `pnpm -F @core/client test -- admin trace-viewer cost-charts && pnpm -F web build`; `framework-ok`.

### Task 14: `/settings` agent pages and approvals inbox (web + desktop)

**Contexts:** spec §7; SP2 settings layout and navigation manifest; `@.contexts/engineering/architecture/fsd.md`

**Files:**
- Create: `app/packages/client/src/views/settings-{agents,connectors,evals,traces,usage,workflows,schedules,flags}/**`, `src/views/approvals-inbox/**`, `src/features/{approval-decision,schedule-editor,connector-editor,tenant-prompt-addendum}/**` (schedule editor: cron builder with presets, IANA zone select defaulting to the resolved zone, next 5 fires shown in schedule zone and viewer zone)
- Create: `app/apps/web/src/app/(app)/settings/{agents,connectors,evals,traces,usage,workflows,flags}/**/page.tsx`, `app/apps/web/src/app/(app)/approvals/[[...approvalId]]/page.tsx`; desktop routes for approvals and settings pages that SP2 exposes on desktop (no `/admin` on desktop)
- Modify: core navigation manifest (permission-filtered entries), user menu badge with pending approvals count (Firestore listener on `approvals`)
- Test: approval decision flow (approve/reject with comment; requester sees no buttons), schedule editor validation (interval, zone), connector editor never shows secrets, usage page shows budget state

- [ ] Steps: read → failing tests → implement → PASS → `pnpm -F web build && pnpm -F @core/desktop build` → progress → commit `feat(workflows): add tenant settings pages and approvals inbox`

**Verify:** `pnpm -F @core/client test && pnpm -F web build && pnpm -F @core/desktop build`; `framework-ok`.

### Task 15: E2E — HITL workflow with four eyes and scheduled workflow

**Contexts:** umbrella §1 item 4, §13 (SP5); `@.contexts/engineering/stacks/testing/playwright.md`

**Files:**
- Create: `app/e2e/workflow-approval.spec.ts` (seed users `member@demo.local` with `example.note.create` flagged `requiresApproval` and `approver@demo.local` with `access.approval.decide`; member asks the chat to create a note → approval-pending card; member cannot approve in inbox; approver (second browser context) approves with comment → note exists → audit entries for request, decision, execution; reject path executes nothing)
- Create: `app/e2e/workflow-schedule.spec.ts` (local policy 1 min: create schedule for `usage-report` in `America/Sao_Paulo` from `/settings/workflows`; next fires shown in both zones; wait (poll API, max 150 s) for a run from the schedule; run appears with success and progress stream; pause stops further fires; run-now creates a run immediately)
- Modify: e2e seed (second user, permission flagged `requiresApproval` in the example module manifest for the test tenant), Mastra e2e env `SCHEDULE_MIN_INTERVAL_MINUTES=1`

- [ ] Steps: read → specs → green → progress → commit `test(workflows): add hitl approval and schedule e2e`

**Verify:** `cd app && WEB_PORT=3100 pnpm test:e2e -- workflow-approval workflow-schedule`; `framework-ok`.

### Task 16: E2E — `/admin` traces, costs and evals

**Contexts:** umbrella §1 item 5, §13 (SP5)

**Files:**
- Create: `app/e2e/admin-observability.spec.ts` (staff with MFA via emulator second factor helper from SP1: after a chat turn by a tenant user, `/admin/traces` lists the trace filtered by tenant, detail shows agent/tool spans with tokens and cost; `/admin/costs` shows the tenant's cost for today > 0 in fake mode prices; `/admin/evals` shows the latest experiment with verdict from `pnpm evals` + `evals:publish` to the local server; non-staff gets 403 page; staff without MFA blocked), axe scan on each admin page (zero violations)

- [ ] Steps: read → spec → green → progress → commit `test(admin): add admin traces, costs and evals e2e`

**Verify:** `cd app && WEB_PORT=3100 pnpm test:e2e -- admin-observability`; `framework-ok`.

### Task 17: Criterion §1 complete — final verification

**Contexts:** umbrella §1 (all six items and the command line), §13; SP0–SP4 summaries; `app/README.md`

**Files:**
- Create: `app/e2e/criterion-1.spec.ts` (one journey on a fresh `pnpm seed:local`: (1) login, choose org and project in the sidebar, edit profile language/time zone/currency/theme; (2) chat with the supervisor → delegation, streaming, interactive component, approval, history entry, upload, voice; (3) KB question with citation + data catalog question + `renderForm` → submit → approval → audit; (4) HITL workflow approved by a second user + a scheduled run observed; (5) `/admin` traces, costs per tenant, eval results)
- Create: `docs/plans/2026-09-29-sp5-workflows-admin/reports/criterion-1.md` (evidence per item with command, output excerpt, screenshot paths under `reports/`; item 6 evidence: `pnpm -F @core/desktop tauri:build --debug` or SP2's desktop e2e/smoke command opening the user area against the local `/v1`, with the screenshot; any item that cannot be proven → FAIL with reason, not "done")
- Modify: `app/README.md` (end-to-end tour: start, seed, users, chat, workflows, admin; "create a module" section covering `defineModule` + `defineAgentModule` (agents, tools, commands, skills, workflows, schedules)), `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (close resolved items, add new ones)

- [ ] Step 1: Read contexts
- [ ] Step 2: Fresh environment: `docker compose down -v` is **not** allowed on shared data unless the container is ours (`core-postgres-1`); instead use a fresh database name `app_criterion` (`createdb` in the container) and a fresh `.firebase-data-criterion` export dir via env for this run
- [ ] Step 3: `pnpm install && pnpm dev` (background, `WEB_PORT=3100`) and `pnpm seed:local`
- [ ] Step 4: Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:postgres && pnpm test:emulators && AI_MODE=fake pnpm evals && WEB_PORT=3100 pnpm test:e2e && pnpm contracts:check`
- [ ] Step 5: Desktop check (item 6) per the report instructions
- [ ] Step 6: Write the report with PASS/FAIL per criterion item and per command; stop the processes you started (by PID tree)
- [ ] Step 7: Progress + commit `test(workflows): verify success criterion end to end`

**Verify:** report shows all six items and all gate commands PASS with fresh evidence; `framework-ok`.

---

## Traceability

| Requirement | Source | Tasks |
|---|---|---|
| Workflows with HITL suspend/resume | prompt item 4; umbrella §9 | 2, 3, 15 |
| Scheduled workflows with cron + time zone | prompt items 4, 10; umbrella §9 | 5, 15 |
| Approvals inbox, four eyes | umbrella §9, §16.2 | 2, 3, 14, 15 |
| Streaming progress | umbrella §9 | 4 |
| Core workflows (ingest, reindex, approval, usage report) | umbrella §9 | 2, 5, 6, 7 (+ SP3 14) |
| `/admin`: orgs & plans, users & impersonation, agents, prompts, connectors, datasets/experiments/evals, traces/logs, costs with caps/alerts, flags | prompt item 11; umbrella §9 | 8, 9, 10, 11, 12, 13, 16 |
| `/settings` tenant subset | umbrella §6, §9 | 14 |
| Evals history in BigQuery, CI gate visible | prompt item 7; umbrella §10 | 6, 7, 11, 16 |
| Token/cost per tenant, ceilings, alerts | prompt item 8; umbrella §10 | 6, 10, 13 |
| Kill-switch, flags governance | rules/governance.md | 8 |
| Criterion §1 complete + README | umbrella §1; prompt "Entrega esperada" | 17 |

## Self-review

- Every spec §9 decision is recorded (Task 0) and implemented (Tasks 2–14).
- Gate SP5: Tasks 15–16; final criterion: Task 17 with explicit PASS/FAIL evidence.
- No task touches `.contexts/` or `.claude/`; every Verify has `framework-ok`; tests offline.
