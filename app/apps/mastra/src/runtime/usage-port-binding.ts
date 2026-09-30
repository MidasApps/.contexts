import type { UsagePort } from "@core/agents";
import type { UsageServices } from "@core/services";

/** Bug guard: the ledger exporter sent rows the `usage.LlmCall` contract refuses; the exporter logs and retries. */
export class UsageRowsRejectedError extends Error {
  readonly code = "USAGE_ROWS_REJECTED";
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`usage ledger rows rejected: ${fields.join(", ")}`);
    this.name = "UsageRowsRejectedError";
    this.fields = fields;
  }
}

/**
 * Usage port over the `usage` use cases (SP3 Task 16, decision 0026): ledger writes
 * from the exporter and the budget check of the tenant budget guard. A rejected
 * batch rejects (field names only), so the exporter keeps the rows and logs.
 */
export const bindUsagePort = (usage: Pick<UsageServices, "recordLlmCalls" | "checkTenantBudget">): UsagePort => ({
  recordLlmCalls: async (calls) => {
    const result = await usage.recordLlmCalls(calls);
    if (!result.ok) throw new UsageRowsRejectedError(result.error.details.map((detail) => detail.field));
  },
  checkTenantBudget: (input) => usage.checkTenantBudget(input),
});
