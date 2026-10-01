// Composition root of the usage context (SP3 Task 16): use cases over one repository, and the sink.
import type { Clock } from "../shared/clock/clock.ts";
import type { Logger } from "../shared/observability/logger.ts";
import type { UsageRepository } from "./application/ports/usage-repository.ts";
import type { UsageSink } from "./application/ports/usage-sink.ts";
import { type CheckTenantBudget, makeCheckTenantBudget } from "./application/use-cases/check-tenant-budget.ts";
import { type GetUsageSummary, makeGetUsageSummary } from "./application/use-cases/get-usage-summary.ts";
import { makeRecordLlmCalls, type RecordLlmCalls } from "./application/use-cases/record-llm-calls.ts";
import { type BigQueryDailyRollupRow, createBigQueryLlmCallsTable, createBigQueryUsageSink, DAILY_ROLLUPS_TABLE } from "./adapters/driven/bigquery-usage-sink.ts";
import { createNoopUsageSink } from "./adapters/driven/noop-usage-sink.ts";

export type UsageServices = {
  readonly recordLlmCalls: RecordLlmCalls;
  readonly checkTenantBudget: CheckTenantBudget;
  readonly getUsageSummary: GetUsageSummary;
};

export const createUsageServices = (deps: { readonly repository: UsageRepository; readonly clock: Clock }): UsageServices => ({
  recordLlmCalls: makeRecordLlmCalls(deps),
  checkTenantBudget: makeCheckTenantBudget(deps),
  getUsageSummary: makeGetUsageSummary(deps),
});

/**
 * `USAGE_SINK` → adapter: `bigquery` exports to `<dataset>.llm_calls` and `<dataset>.daily_rollups`; `none` (the
 * default, and the only sensible value in `local`) logs and drops.
 */
export const createUsageSink = (config: {
  readonly kind: "none" | "bigquery";
  readonly dataset: string;
  readonly projectId?: string;
  readonly logger: Logger;
}): UsageSink =>
  config.kind === "bigquery"
    ? createBigQueryUsageSink({
        table: createBigQueryLlmCallsTable({ dataset: config.dataset, ...(config.projectId === undefined ? {} : { projectId: config.projectId }) }),
        rollupsTable: createBigQueryLlmCallsTable<BigQueryDailyRollupRow>({
          dataset: config.dataset,
          table: DAILY_ROLLUPS_TABLE,
          ...(config.projectId === undefined ? {} : { projectId: config.projectId }),
        }),
      })
    : createNoopUsageSink(config.logger);
