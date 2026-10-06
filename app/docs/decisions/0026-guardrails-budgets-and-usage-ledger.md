# 0026. Guardrail profile, tenant budget hard cap and usage ledger

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents/src/processors`, `app/packages/agents/src/observability`, `app/packages/services/src/services/usage`, Postgres schema `usage` (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-12, D3-13 (§12, §13)

## Context

Mastra's LLM-backed detectors default to `errorStrategy: 'warn'` (fail-open). `TokenCostControl` is best-effort (async metrics), needs a metrics-capable store and its `organization`/`user` scopes are fail-open when the context key is missing. `rules/governance.md` ("Custo de IA e de consultas") requires a hard cap and an approval/alert threshold below it, and per-tenant cost visibility.

## Decision

1. **D3-12 — Guardrails.** Default profile per agent (tenant-tunable in `agent-settings`): input `UnicodeNormalizer`, `PromptInjectionDetector` (block, threshold 0.8), `ModerationProcessor` (block), `PIIDetector` (warn or redact), `TenantBudgetGuard`, `TokenLimiterProcessor` (60 000 input tokens); output `SystemPromptScrubber` (redact), `RegexFilterProcessor` for secret-shaped strings and `CitationGuard` (knowledge agent). LLM detectors use the `fast` role with `errorStrategy: 'strict'` (fail closed) and run on the supervisor; external tool results (web, MCP, OpenAPI) are wrapped as data and scanned in `warn` mode.
2. **D3-12 — Budgets.** The hard cap is the own `TenantBudgetGuard`: monthly micro-USD and token caps per tenant from `usage.tenant_budgets`, checked before each run, fail-closed; `maxOutputTokens` 4 096 per call. The alert/approval threshold is 80 % of the cap. Caps come from one helper (`usage/budget-policy.ts`); invalid config falls back to the plan default, never "no cap". `TokenCostControl` is only a soft daily signal, and only if `PostgresStoreVNext` metrics work (SP3 Task 16).
3. **D3-13 — Usage ledger.** `UsageLedgerExporter` (a Mastra observability exporter) writes `MODEL_GENERATION` spans to `usage.llm_calls` in batches; cost from `model-prices.ts` (micro-USD per 1M tokens, with `PRICES_VERIFIED_AT`); a missing price stores `null`, logs `usage_price_missing`, and the budget then counts tokens. A `UsageSink` port exports to BigQuery `ai_observability.llm_calls` outside `local` (no-op in `local`).

## Consequences

- A detector outage blocks requests instead of letting them through; this is intended.
- Cost figures are estimates from a dated price table, not invoices.
- Metrics `ai_tokens_total`, `ai_cost_micro_usd_total`, `ai_tripwires_total`, `ai_tool_approvals_total` and a TTFT histogram come from the same spans.

## Alternatives rejected

- **`TokenCostControl` as the hard cap.** Best-effort and fail-open by design.
- **Default `errorStrategy: 'warn'`.** A provider hiccup would silently disable injection and moderation checks.
- **Cost from provider billing exports only.** Arrives a day late and cannot stop a runaway tenant.

## Amendments

- **2026-09-30 — caps in force, ledger identity and the `TokenCostControl` probe (SP3 Task 16).**
  Caps in force (the single table rules/governance.md asks for; source `usage/domain/budget-policy.ts`):

  | Cap | Plan default | Per tenant | Alert |
  |---|---|---|---|
  | Monthly spend | 50 000 000 micro-USD (USD 50) | `usage.tenant_budgets.monthly_micro_usd` | 80 % |
  | Monthly tokens (input + output, priced or not) | 20 000 000 | `usage.tenant_budgets.monthly_tokens` | 80 % |

  Each cap falls back to the plan default on its own when the stored value is missing, zero,
  negative, fractional or not a safe integer. Months are UTC calendar months. The ledger rows
  get a uuidv7 id from the exporter (so a retried batch and the BigQuery `insertId` keep the same
  identity; duplicates are skipped by `ON CONFLICT (id) DO NOTHING`). Tenant, user and request id
  of a row come from the span's request-context snapshot, never from span metadata: a caller's
  `tracingOptions.metadata` overrides metadata keys of the root span (observed in the probe).
  The runtime reaches the tables only as `usage_runtime` (migration 0007: row level security,
  `FORCE`, append-only ledger, view with `security_invoker`). The budget check reads the
  indexed `(tenant_id, occurred_at)` range; the view serves reports. `TokenCostControl`
  probe (`@mastra/pg` 1.27.1, local Postgres 18): with `PostgresStoreVNext` the cost metrics are
  recorded and the processor tripped on the second run; it stays off
  (`TOKEN_COST_CONTROL_ENABLED = false`) because enabling it means swapping the Mastra storage
  to `PostgresStoreVNext` with its own observability connection, DDL for its signal tables in
  `db:init` and Mastra's own price table; Mastra documents that store for low-volume
  production only. The hard cap and the 80 % alert come from the own ledger.
- **2026-09-30 — guardrail order and export of spans (SP3 Task 17).** The input stack runs
  `UnicodeNormalizer` → `TenantBudgetGuard` → `PromptInjectionDetector` → `ModerationProcessor`
  → tenant PII detector → `TokenLimiterProcessor`: the hard cap comes before the LLM detectors,
  so a tenant over its cap spends nothing on detection. The tenant PII mode is read from
  `agent-settings` per run; an unreadable setting means `redact`. `SystemPromptScrubber` checks
  the final answer only (`processOutputResult`): on the stream it calls the model once per text
  delta; secret-shaped strings are still redacted on the stream by `RegexFilterProcessor`
  (`secrets` preset). Profiles: `entry` (every agent a caller reaches directly; today all of
  them) and `delegated` (normalizer, budget, token limit, regex filter) for supervisor-only
  subagents from Task 20. Tracing: the observability instance samples every trace and keeps
  internal spans, because the usage ledger must see every model call, detector calls included
  (they run in internal spans); storage and OTLP sample 20 % of traces per exporter outside
  `local`/`dev`, by trace id. Before export, `metadata.resourceId` (`tenantId:uid`) becomes a
  `sha256:` pseudonym, `metadata.userId` is dropped and the request-context snapshot keeps only
  the span context keys; OTLP carries no prompts or answers outside `local`/`dev`. Body
  `tracingOptions` are server-owned: the gateway strips them and the context middleware
  replaces them with the forwarded `traceparent`.
- **2026-09-30 — the warehouse gets a hashed user id (doctrine fix).** The BigQuery sink
  exports `user_id_hashed` (SHA-256 hex of the uid, `null` for platform jobs) instead of the
  raw `user_id` of the canonical contracts/bigquery.md §14 table: §15 (PII and governance)
  prefers hashed derived columns when the analytical use allows it, and counting or joining
  users by a stable pseudonym is all the usage reports need. The raw uid stays in the
  Postgres ledger (`usage.llm_calls`, row level security). SP5's table DDL follows this column.
