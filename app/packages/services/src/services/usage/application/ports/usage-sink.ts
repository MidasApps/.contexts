import type { LlmCall, UsageDailyRollup } from "@core/contracts";

/**
 * Export of usage to the warehouse (BigQuery `ai_observability`, contracts/bigquery.md §14)
 * outside `local`; a no-op that logs in `local`. The `usage-report` workflow (SP5) reads the
 * ledger and the rollups and calls it. Ledger rows are idempotent by row id; a rollup row is
 * deduplicated by its content (the latest `exported_at` per key is the current value).
 */
export type UsageSink = {
  readonly exportCalls: (calls: readonly LlmCall[]) => Promise<void>;
  readonly exportRollups: (rollups: readonly UsageDailyRollup[]) => Promise<void>;
};
