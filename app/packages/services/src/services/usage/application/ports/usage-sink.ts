import type { LlmCall } from "@core/contracts";

/**
 * Export of ledger rows to the warehouse (BigQuery `ai_observability.llm_calls`,
 * contracts/bigquery.md §14) outside `local`; a no-op that logs in `local`.
 * SP5's usage report workflow reads the ledger and calls it. Idempotent by row id.
 */
export type UsageSink = { readonly exportCalls: (calls: readonly LlmCall[]) => Promise<void> };
