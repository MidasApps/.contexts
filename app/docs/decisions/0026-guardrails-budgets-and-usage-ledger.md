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
