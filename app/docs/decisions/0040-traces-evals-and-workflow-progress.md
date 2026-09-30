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
