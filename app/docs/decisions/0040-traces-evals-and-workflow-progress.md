# 0040. Traces, evals, exports and workflow progress streams

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/services/src/services/{observability,evals,workflows}`, `app/packages/agents/src/{workflows,chat}` (local decision; the framework is unchanged)
- **Records:** SP5 spec D5-06 (§8) and D5-07 (§3.6); `@.contexts/engineering/contracts/api.md` §14
- **Relates to:** decisions 0026 (observability, BigQuery sink), 0028 (evals gate), 0031 (chat stream)

## Context

The console needs traces, experiments and the progress of workflow runs. Mastra keeps spans,
datasets and experiments in its Postgres storage and serves them through routes the private
runtime already allows. No tenant may see another tenant's data.

## Decision

**D5-06: traces and evals.**

- `/v1/traces` (tenant) and `/v1/admin/traces` (staff) read Mastra observability through the
  gateway.
  - Tenant endpoints always filter on the server by `metadata.tenantId = <active tenant>`,
    whatever the query asks.
  - Spans map to `observability.TraceSummary` and `observability.TraceDetail`.
  - Fields marked pii `sensitive` never leave the server.
- Datasets and experiments use `mastra.datasets`. CI eval results can be published as
  experiments (`pnpm evals:publish`). Outside local, `eval-export` exports them to BigQuery
  `ai_observability.eval_runs`. Usage rollups are exported through `UsageSink` with `insertId`.
- Thumbs feedback becomes Mastra trace feedback and, optionally, an item of a tenant dataset.

**D5-07: workflow progress.**

- `GET /v1/workflows/runs/{runId}/stream` re-emits the Mastra run stream in the SSE format of
  `api.md` §14:
  - `event: data` for each workflow event `{ type, stepId, status, output? }`, with the output
    redacted by schema pii;
  - `event: done` and `event: error`;
  - `Last-Event-Id` resumes from an event index.
- Runs are scoped to the tenant by the `resourceId` prefix `tenantId:`. Another tenant's run
  answers 404.
- Workflows started from chat stream as `data-workflow` parts (`workflowRoute` v7), like the rest
  of the chat protocol (decision 0031).

## Consequences

- One observability store: spans are not copied outside Mastra, and BigQuery gets rollups only.
- The console and `/settings` share the same viewers and the same SSE endpoint.

## Alternatives rejected

- **Clients calling Mastra observability routes directly.** Mastra is private, and `/v1` must
  apply the tenant filter.
- **WebSocket progress.** `api.md` §14 standardizes on SSE.

## Amendments

- **A1 — 2026-10-01 (SP5 Task 4): runs and progress go through custom runtime routes.**
  - `/v1/workflows/runs*` reaches custom Mastra routes `/workflow-runs/*` behind the context
    middleware, not Mastra's built-in workflow routes. The tenant and the caller come from the
    verified Bearer, the routes authorize again through SP1, and a run belongs to a tenant by its
    `resourceId` prefix `tenantId:`. The built-in list filters by the exact resource only, and
    `/v1` addresses runs by run id alone.
  - Progress events are derived from the stored run snapshot instead of `observeStream`. `/v1`
    polls it every second, so indexes stay stable across reconnections and `Last-Event-Id`
    resumes after one. A stream window lasts 5 minutes, and step outputs are never sent.
  - The run view surfaces `approvalRequestId` from the suspended step's payload, and
    `startedBy` and `scheduleId` from the run's request context.
- **2026-10-01 — traces, evals and feedback as built (SP5 Task 11).**
  - **Console routes.** The runtime serves `/console/traces[/:traceId]`, `/console/experiments`
    (GET, POST), `/console/eval-runs`, `/console/datasets` and `/console/feedback-items`: custom
    routes outside the API prefix, no user Bearer, Cloud Run IAM outside local (like the settle
    route of decision 0036). `/v1` authorizes first (`requireTenant` / `requireStaff`) and passes
    the tenant of a tenant endpoint itself; no tenant means staff. The raw `/api/observability` and
    `/api/datasets` routes are not used by `/v1`.
  - **Tenant isolation.** Trace lists filter on the root span's `metadata.tenantId` in storage and
    check every trace again in the reader, so a storage filter that is ignored still leaks nothing
    (proven against the in-memory store); a trace of another tenant reads as 404. Experiments and
    datasets filter on Mastra's `organizationId` and are checked again the same way.
  - **Redaction.** Span input and output drop every key named like a credential (the
    `SensitiveDataFilter` field list, whole-key match) at any depth, on top of the filter that ran
    at write time. Cost per trace is `null` (the ledger has it per call; join is a follow-up).
  - **Experiments.** CI reports (`pnpm evals:publish`, a no-op without `EVALS_TARGET_URL`) and
    prompt evals (decision 0038 amendment) are stored as completed Mastra experiments whose
    metadata keeps the per-scorer means, baseline floors and verdict; `/v1/admin/experiments`,
    `/v1/evals/experiments` and the `eval-export` workflow read that one store (its source is now
    bound in `create-agent-runtime.ts`). Comparing two experiments and editing dataset items in
    the console are not built yet.
  - **Tenant experiments.** `POST /v1/evals/experiments` needs `core.eval.write` and an agent the
    organization enabled (the supervisor always is; else 400 `AGENT_NOT_ENABLED`). The runtime
    reads the dataset under the organization and starts the experiment asynchronously with the
    caller's current grants (context resolved from the uid `/v1` passes). Only agents registered
    in Mastra (the supervisor, module entry agents) can be targets; one context serves every item,
    so items share a memory thread.
  - **Feedback.** `POST /v1/conversations/{id}/feedback`: the owner of the conversation
    (`core.conversation.send`; another member's conversation is 404) rates a message. One
    Firestore document `message-feedback/{sha256(tenant, conversation, message, user)}` per
    message and user (a second rating replaces the first). With `addToDataset` the turn goes to the
    organization's `feedback` dataset (created on first use, item `externalId` = the same key);
    a dataset failure is logged and the rating stays. Mastra trace feedback is not written yet.
