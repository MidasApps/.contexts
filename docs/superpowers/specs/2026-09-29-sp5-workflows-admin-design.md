# Spec — SP5 Workflows, `/admin` and tenant `/settings`

- **Status:** draft for execution (planner output, 2026-09-29)
- **Umbrella:** `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §1, §9, §10, §13 (SP5), §16.2, §16.3
- **Origin prompt:** `docs/prompts/2026-09-29-agentic-app-core-harness.md` items 4, 7, 8, 11, 13 and "Entrega esperada"
- **Depends on:** SP3 runtime (workflows engine, usage ledger, scorers/datasets, observability,
  connectors, `ApprovalPort`), SP4 chat (approval-pending card, workflow parts in chat), SP1
  (staff principal with MFA, impersonation, audit, permissions `requiresApproval`), SP2
  (shell, `/settings` layout, `DataTable`, `SchemaForm`, i18n, time zone resolution).
- **Plan:** `docs/plans/2026-09-29-sp5-workflows-admin.md`

## 1. Scope and gate

Workflows with human-in-the-loop (suspend/resume, four eyes) and schedules with time zone;
an approvals inbox; streaming progress; the core workflows (KB ingestion and catalog
reindex from SP3, generic approval, usage report, approval expiry sweep, conversation
purge); the platform console `/admin` (staff only, web only) and the tenant-scoped
`/settings` pages for agents, prompts, connectors, datasets/experiments/evals,
traces/logs, costs and flags.

**Gate (umbrella §13):** a HITL workflow and a scheduled workflow proven end to end;
`/admin` shows traces, costs and eval results; **criterion §1 complete** (final task).

## 2. Facts relied on (2026-09-29, `@mastra/core` 1.71.0)

- `createWorkflow({ id, inputSchema, outputSchema, stateSchema, requestContextSchema,
  schedule, retryConfig, options })`, `createStep({ …, suspendSchema, resumeSchema, retries,
  execute({ inputData, resumeData, suspend, abortSignal, requestContext, writer, mastra }) })`,
  `.then/.branch/.parallel/.dowhile/.dountil/.foreach({ concurrency })/.map/.sleep/.sleepUntil`.
  `suspend()` must be returned. Result `status`: `success|failed|suspended|tripwire|paused|canceled`.
- Runs: `wf.createRun({ runId?, resourceId? })`, `start`, `startAsync`, `stream` (events
  `workflow-start|workflow-step-start|workflow-step-output|workflow-step-progress|workflow-step-result|workflow-step-suspended|workflow-finish|workflow-canceled`),
  `resume({ step, resumeData })` (atomic claim on pg: a second resume gets
  `WORKFLOW_RESUME_ALREADY_CLAIMED`), `cancel()`, `timeTravel`, `restart`,
  `wf.listWorkflowRuns({ status: 'suspended', resourceId, … })`, `getWorkflowRunById`.
  `watch()` is not public API in v1; use streams.
- Schedules (Beta since 1.50): declarative `createWorkflow({ schedule: { cron, timezone,
  inputData, requestContext, metadata } | [...] })` (ids `wf_<id>` / `wf_<id>__<scheduleId>`);
  runtime `mastra.schedules.create({ workflowId, cron, timezone, inputData, requestContext,
  resourceId, metadata, status })` (ids `schedule_<slug>`), `.list/.get/.update/.pause/.resume/.run/.delete`;
  tables `mastra_schedules`, `mastra_schedule_triggers`; Croner 5–7 fields; timezone defaults
  to the host, so it is always set; one scheduler per deployment, no missed-fire replay,
  needs a long-lived host (umbrella §16.3: `min-instances ≥ 1`, CPU always allocated).
  Do not set `MASTRA_WORKERS`.
- Datasets/experiments: `mastra.datasets.create/get/list`, `dataset.addItems`,
  `startExperiment({ targetType, targetId, scorers })`, `compareExperiments`; tables
  `mastra_datasets*`, `mastra_experiments*`; scores in `mastra_scorers`.
- Traces: `MastraStorageExporter` writes `mastra_ai_spans`/`mastra_traces`; Mastra exposes
  observability routes (`/api/observability/*`) and client-js methods; spans carry
  `tenantId` metadata (SP3 `requestContextKeys`).
- `@mastra/editor` 0.15.3 (not adopted, SP3 §14): the prompt store is the app's own.

## 3. Workflows

### 3.1 Placement

Workflows live in `@core/agents/src/workflows/` (core) and in modules through
`defineAgentModule({ workflows })`. Each workflow declares `requestContextSchema`
(`AgentRequestContext` subset) and reads tenant/principal only from it. Started only by
`/v1` (gateway) or by the scheduler; never by the client directly.

### 3.2 Core workflows

| Id | Trigger | Shape |
|---|---|---|
| `knowledge-ingest` | `/v1/knowledge/sources`, upload event | SP3 |
| `catalog-reindex` | deploy/seed, platform schedule `0 3 * * *` UTC | SP3 |
| `approval-request` | `ApprovalPort.requestApproval()` (four-eyes tool call) or `/v1/approvals` (generic) | `validate` → `notify-approvers` → `await-decision` (suspend) → branch `approved` → `execute-action` / `rejected|expired` → `record-outcome` |
| `usage-report` | platform schedule `15 * * * *` UTC (hourly) + per-tenant daily digest via tenant schedule | aggregate `usage.llm_calls` → `usage.daily_rollups` (idempotent upsert per tenant/day/model) → `UsageSink` export (BigQuery outside local) → budget alerts (80 % / 100 %) → notification |
| `approval-expiry-sweep` | platform schedule `*/15 * * * *` UTC | resumes expired approval runs with `{ decision: 'expired' }` |
| `conversation-purge` | platform schedule `30 4 * * *` UTC | hard-deletes conversations soft-deleted > 30 days (Firestore + Mastra thread) |
| `eval-export` | after each experiment finishes + daily | exports experiment summaries to BigQuery `ai_observability.eval_runs` (no-op sink in local) |

### 3.3 Generic approval (`approval-request`) — HITL and four eyes

Input (`agents.ApprovalRequest`, SP3 contract): `tenantId`, `requestedBy`,
`permission`, `action` (`{ kind: 'command', commandId, input, idempotencyKey }` or
`{ kind: 'workflow', workflowId, inputData }` or `{ kind: 'generic', summaryKey, payload }`),
`preview` (before/after), `reason?`, `expiresAt` (default +72 h, max 30 d), `origin`
(`conversationId`, `toolCallId`?).

- `validate`: re-checks `authorize(requestedBy, permission)` now (grants may have changed).
- `notify-approvers`: approvers = members holding `access.approval.decide` on the node of
  the action (SP1 query), minus the requester; writes the Firestore projection
  `approvals/{runId}` (`tenantId`, `status: pending`, `permission`, `summary`, `preview`,
  `requestedBy`, `approverUids`, `createdAt`, `expiresAt`, `decidedBy?`, `decidedAt?`,
  `outcome?`) and a notification per approver (SP1/SP2 notifications; FCM optional).
- `await-decision`: `suspend({ approvalId })`, `resumeSchema = { decision:
  'approve'|'reject'|'expired', decidedBy?, comment? }`.
- On resume the step verifies: `decidedBy !== requestedBy` (four eyes), `decidedBy` holds
  `access.approval.decide` **and** the action permission at decision time; otherwise it
  suspends again and the API returns 403. Expired → `expired`.
- `execute-action`: runs the command use case as the **requester** (their current grants,
  `authorize` again) with the stored idempotency key, then records audit
  `approvals.request.approved` + the command's own audit; `record-outcome` updates the
  projection and notifies the requester (and the chat, via the SP4 pending card polling
  `GET /v1/approvals/{id}`).
- Concurrency: Mastra's atomic resume claim prevents double execution; the projection
  update uses a Firestore transaction on `status == 'pending'`.

### 3.4 Approvals inbox API

`GET /v1/approvals?status=pending&cursor&limit` (items where the caller is an approver or
requester), `GET /v1/approvals/{id}`, `POST /v1/approvals/{id}/decision { decision:
'approve'|'reject', comment? }` → gateway `resumeWorkflow` → 200 with the outcome (or 202
while executing), `POST /v1/approvals` (generic requests from modules; permission of the
action). Realtime: the client listens to `approvals` projection docs (Rules: readable by
`requestedBy` and `approverUids`; writes denied).

### 3.5 Schedules with time zone

- Platform schedules are declarative on the core workflows (UTC).
- Tenant schedules: `/v1/schedules` CRUD → `mastra.schedules.create({ id:
  'schedule_<tenantId>_<slug>', workflowId, cron, timezone, inputData, requestContext: {
  tenantId, projectId?, nodeId?, userId: createdBy, … }, resourceId: 'tenantId:uid', metadata:
  { tenantId, createdBy } })`. Only workflows flagged `schedulable: true` in their
  `AgentModule` entry can be scheduled; `inputData` validated against the workflow schema;
  `timezone` required (IANA, validated by `TimeZoneSchema`; UI default = resolved time
  zone of the node → project → organization, umbrella §6); `cron` limited to 5 fields and a
  minimum interval of 15 min (Croner next-dates check).
- A scheduled run executes with the creator's **current** grants: the first step of every
  schedulable workflow re-authorizes; a creator who lost access → run fails `FORBIDDEN` and
  the schedule is paused with a notification.
- Pause/resume/run-now/delete; list shows next fire in the schedule's zone and the viewer's
  zone. History from `mastra_schedule_triggers` + run status.
- `/v1/schedules` permissions `workflows.schedule.read|write`; staff see all in `/admin`.

### 3.6 Streaming progress

`GET /v1/workflows/runs/{runId}/stream` → gateway → Mastra run stream (`observeStream`)
→ re-emitted in `api.md` §14 SSE format (`event: data` per workflow event with
`{ type, stepId, status, output? (redacted by schema pii) }`, `event: done`, `event: error`).
Chat (SP4) shows workflows started from a tool with `data-workflow` parts
(`workflowRoute`/`toAISdkStream` v7); `/settings/workflows/runs/{runId}` and `/admin` use
the SSE endpoint. `GET /v1/workflows/runs?workflowId&status&cursor` lists runs of the tenant
(`resourceId` prefix `tenantId:`); `POST /v1/workflows/runs/{runId}/cancel`.

## 4. Prompts: versioned store with eval-gated activation (D5-03)

Governance allows a runtime-editable prompt store only by ADR, with every write creating a
version, author, timestamp and rollback, and an eval before production changes.

- Postgres `agents.prompt_versions(id uuidv7, agent_id text, scope text check in
  ('platform','tenant'), tenant_id text null (not null when scope = tenant), version int,
  body text, body_sha256 text, created_by text, created_at, note text, eval_experiment_id
  text null, eval_verdict text null, unique(agent_id, scope, tenant_id, version))` and
  `agents.prompt_activations(id, agent_id, scope, tenant_id, version_id, activated_by,
  activated_at)` (append-only; the latest row is active; rollback = new activation of an
  older version). RLS by tenant for tenant scope.
- Platform scope = full instructions (staff). Tenant scope = an **addendum** appended under
  a delimited section (tenants cannot replace safety instructions).
- Activation requires an experiment on the agent's dataset with the candidate prompt
  (`startExperiment` with a request-context override `promptVersionId`) whose verdict is
  `passed` against the baseline; staff may force with a recorded reason (audit
  `agents.prompt.forced_activation`).
- `load-instructions.ts` (SP3) resolves: platform active version → code seed fallback;
  appends tenant addendum; cached 60 s per (agent, tenant). Seeds (`instructions/*.md`) are
  imported as version 1 by a migration script.

## 5. Flags (D5-04)

`FlagsPort` with two adapters: **Remote Config** server templates (`firebase-admin`
`getRemoteConfig()`, remote envs) and **Firestore `feature-flags`** (local; Remote Config has
no emulator). Flag registry in code (`packages/services/src/services/flags/flag-registry.ts`):
`key`, `owner`, `reason`, `createdAt`, `expiresAt`, `kind: 'kill-switch'|'rollout'|'ops'`,
`default` (governance "Feature flags"); values per environment and per tenant override.
Core flags: `ai.kill-switch` (all agent runs return 503 `FEATURE_DISABLED`),
`ai.web-tools`, `chat.voice.realtime`, `ai.memory.observational`, `workflows.schedules`.
`/admin/flags` edits values (staff); `/settings/flags` shows tenant-overridable flags only.
Expired flags show a warning in `/admin`.

## 6. `/admin` (web only, staff only)

Access: `platform staff` principal with MFA (SP1 `requireStaff({ mfa: true })` on every
`/v1/admin/*` handler and on the `/admin` layout); read-only impersonation is SP1's; SP5
shows the entry points. Layout in `apps/web/src/app/admin/**` (composition only), UI in
`@core/client` (`views/admin-*`, `widgets/admin-*`).

| Page | Content | API |
|---|---|---|
| `/admin` | overview: tenants, active users (7 d), cost MTD, tripwire rate, approval rate, eval status | `GET /v1/admin/overview` |
| `/admin/organizations` | list/search orgs, plan, status, cost MTD; detail with members count, budget | `GET /v1/admin/organizations`, `PATCH /v1/admin/organizations/{id}` (plan, status) |
| `/admin/plans` | plan catalog (Firestore `plans`: `name`, `limits { monthlyMicroUsd, monthlyTokens, maxConnectors, features[] }`) | `/v1/admin/plans` CRUD |
| `/admin/users` | search users, memberships, impersonate (SP1 endpoint; banner while active) | SP1 endpoints |
| `/admin/agents` | agents catalog (core + modules), per-tenant enablement matrix | `GET /v1/admin/agents`, `PUT /v1/admin/organizations/{id}/agent-settings` |
| `/admin/agents/{id}/prompts` | versions, diff, create draft, run eval, activate, rollback | `/v1/admin/agents/{id}/prompt-versions`, `/activations` |
| `/admin/connectors` | all tenants' connectors (read), disable | `/v1/admin/connectors` |
| `/admin/evals` | datasets (items, versions), experiments (scores, compare), CI eval history | `/v1/admin/datasets`, `/v1/admin/experiments` |
| `/admin/traces` | trace list (filters: tenant, agent, status, time), trace detail (span tree, tokens, cost, tool calls, redacted I/O); link to logs | `/v1/admin/traces`, `/v1/admin/traces/{traceId}` |
| `/admin/logs` | in local: last N Mastra/web log lines from a ring buffer; remote: deep link to Cloud Logging filtered by `trace_id`/`requestId` | `GET /v1/admin/logs` (local only) |
| `/admin/costs` | cost by tenant/day/model, budgets, caps, alert thresholds (80 % default), over-budget list | `/v1/admin/usage`, `/v1/admin/organizations/{id}/budget` |
| `/admin/workflows` | runs (all tenants), suspended approvals, schedules (platform + tenant), cancel, run now | `/v1/admin/workflows/*` |
| `/admin/flags` | flags with metadata, values, expiry warnings | `/v1/admin/flags` |

Every staff mutation writes `platform-audit-logs` (SP1) with `targetTenantId`.

## 7. `/settings` (tenant-scoped subset)

Inside SP2's settings layout, permission-filtered navigation:
`/settings/agents` (enable agents, web tools opt-in, PII mode, reasoning display, tenant
prompt addendum with versions and rollback; activating an addendum needs a passing eval
run, triggered from the page), `/settings/connectors` (SP3 API: create, test
connection, tool policy, secret write-only), `/settings/evals` (tenant datasets built from
thumbs-down feedback or manual items; run experiment on enabled agents; results),
`/settings/traces` (own tenant traces only; same viewer as admin), `/settings/usage` (cost
and tokens MTD, per model/agent/user, budget and alert status; read-only budget unless the
plan allows a lower self-cap), `/settings/workflows` (runs, schedules CRUD),
`/settings/approvals` (inbox; also in the user menu), `/settings/flags` (tenant overrides).

Server rule: every `/v1` tenant endpoint scopes by the active tenant from the token, never
by a path tenant id.

## 8. Evals and observability in the console

- Traces: `/v1/admin/traces` and `/v1/traces` call Mastra observability routes through the
  gateway with a server-side filter `metadata.tenantId = <tenant>` (tenant endpoints) and
  map spans to `observability.TraceSummary`/`TraceDetail` contracts (input/output already
  redacted by `SensitiveDataFilter`; fields with pii `sensitive` never shown).
- Evals: CI results (`app/.evals/*.json` from SP3) are uploaded as Mastra experiments by the
  CI job (`pnpm evals:publish` with `EVALS_TARGET_URL`, optional) and always exported to
  BigQuery by `eval-export` outside local. `/admin/evals` lists datasets, experiments,
  scores per scorer and a comparison against the baseline band.
- Feedback: thumbs up/down on assistant messages (SP4 message actions) →
  `POST /v1/conversations/{id}/feedback` → Mastra trace feedback + optional dataset item
  (tenant dataset `feedback`) — adds the "production → dataset" loop.
- Metrics dashboards (RED, TTFT, tripwire and approval rates) are computed from
  `usage.llm_calls` + audit + Mastra spans for `/admin` overview; Cloud Monitoring dashboards
  are a deploy follow-up.

## 9. Decisions to record (next free numbers)

| Id | Decision |
|---|---|
| D5-01 | Generic `approval-request` workflow with suspend/resume, four eyes at resume, requester re-authorized at execution, Firestore `approvals` projection for the inbox, expiry sweep. |
| D5-02 | Schedules: Mastra Schedules; platform schedules declarative in UTC; tenant schedules via `/v1/schedules` with required IANA zone, ≥ 15 min interval, creator re-authorized per run, auto-pause on failure; single scheduler on the Mastra host. |
| D5-03 | Prompts: own append-only Postgres store (platform full, tenant addendum), eval-gated activation, rollback by re-activation; `@mastra/editor` not adopted. |
| D5-04 | Flags: `FlagsPort` (Remote Config remote, Firestore local), code registry with owner/expiry/kind, core kill-switch `ai.kill-switch`. |
| D5-05 | Plans in Firestore `plans`; budgets derive from plan with tenant override by staff; alert at 80 %. |
| D5-06 | Traces/evals read from Mastra storage through the gateway, tenant-filtered server-side; BigQuery exports via `UsageSink`/eval sink. |
| D5-07 | Workflow progress SSE follows `api.md` §14; chat uses `data-workflow` parts. |
| D5-08 | `/admin` UI in `@core/client` views, composed only by `apps/web/src/app/admin`; staff + MFA checked in layout and every handler. |

## 10. Mastra feature coverage (SP5 part)

| Feature | Decision |
|---|---|
| Workflows: steps, `retryConfig`, `.branch`, `.parallel`, `.foreach`, `.dountil`, `.map`, `.sleep` | adopted (approval, usage report uses `.foreach` over tenants with concurrency 4; ingest `.parallel`) |
| `suspend`/`resume`, atomic resume claim, `listWorkflowRuns({ status: 'suspended' })` | adopted |
| `cancel`, `timeTravel`, `restart` | `cancel` adopted; `timeTravel`/`restart` exposed to staff in `/admin/workflows` for failed runs |
| Workflow streams (`stream`/`observeStream`) | adopted (§3.6) |
| Declarative + runtime schedules | adopted (§3.5) |
| Agent schedules (`agentId` + `prompt`) | not adopted in v1 (scheduled work is expressed as workflows; avoids unattended agent loops) |
| Workers split / Inngest / Temporal | not adopted (one Mastra service) |
| Datasets, experiments, compare, trace scoring, feedback | adopted (§8) |
| Observability routes / storage | adopted (§8) |
| MCPServer `run_<workflow>` | adopted for schedulable read-only workflows (`catalog-reindex` staff only) — others not exposed |
| Editor / stored agents | not adopted (§4) |
| Storage `prune()` retention | adopted in `conversation-purge` for Mastra threads; general retention waits for `compliance.md` |
