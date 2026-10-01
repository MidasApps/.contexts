// Public API of the usage context (SP3 Task 16): ledger usage.llm_calls, budgets and the warehouse sink.
export type { ModelTotals, StoredBudget, UsageRepository, UsageTotals } from "./application/ports/usage-repository.ts";
export type { UsageSink } from "./application/ports/usage-sink.ts";
export { makeRecordLlmCalls, MAX_LLM_CALLS_PER_BATCH, type RecordLlmCalls, type UsageValidationError } from "./application/use-cases/record-llm-calls.ts";
export { BudgetTenantMissingError, type CheckTenantBudget, makeCheckTenantBudget } from "./application/use-cases/check-tenant-budget.ts";
export { type GetUsageSummary, type GetUsageSummaryInput, GetUsageSummaryInputSchema, makeGetUsageSummary } from "./application/use-cases/get-usage-summary.ts";
export { utcMonthStart } from "./application/use-cases/usage-month.ts";
export {
  ALERT_THRESHOLD_PERCENT,
  type Budget,
  type BudgetDecision,
  DEFAULT_PLAN_BUDGET,
  evaluateBudget,
  type MonthSpend,
  resolveBudget,
} from "./domain/budget-policy.ts";
export { usageLlmCalls, usageTenantBudgets } from "./adapters/driven/drizzle-schema.ts";
export { createPostgresUsageRepository, USAGE_RUNTIME_ROLE } from "./adapters/driven/postgres-usage-repository.ts";
export {
  BIGQUERY_INSERT_BATCH,
  type BigQueryLlmCallRow,
  type BigQueryTableLike,
  createBigQueryLlmCallsTable,
  createBigQueryUsageSink,
  LLM_CALLS_TABLE,
  toBigQueryRow,
} from "./adapters/driven/bigquery-usage-sink.ts";
export { createNoopUsageSink } from "./adapters/driven/noop-usage-sink.ts";
export { createUsageServices, createUsageSink, type UsageServices } from "./composition.ts";
// SP5 usage report (Task 6, decision 0039): rollups, warehouse export and budget alerts.
export type { UsageReportRepository } from "./application/ports/usage-report-repository.ts";
export {
  BUDGET_ALERT_THRESHOLDS,
  type BudgetAlertThreshold,
  EXPORT_LAG_MS,
  makeReportTenantUsage,
  type ReportTenantUsage,
  type ReportTenantUsageDeps,
  type TenantUsageReport,
} from "./application/use-cases/report-tenant-usage.ts";
export { createPostgresUsageReportRepository } from "./adapters/driven/postgres-usage-report-repository.ts";
export { type BigQueryDailyRollupRow, DAILY_ROLLUPS_TABLE, rollupInsertIdOf, toBigQueryRollupRow } from "./adapters/driven/bigquery-usage-sink.ts";
export { usageBudgetAlerts, usageDailyRollups, usageExportCursors } from "./adapters/driven/drizzle-schema.ts";
