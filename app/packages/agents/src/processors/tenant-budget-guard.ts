import type { InputProcessor, ProcessInputArgs } from "@mastra/core/processors";
import { readAgentContext } from "../context/agent-request-context.ts";
import type { UsagePort } from "../runtime/runtime-ports.ts";

/**
 * Tenant budget guard (SP3 spec §12, decision 0026): the hard monthly cap,
 * checked once before each run from the usage ledger. Fail-closed: a missing
 * server context or a usage port failure aborts with `BUDGET_UNAVAILABLE`,
 * never lets the run through. The abort reaches the stream as a `tripwire`
 * chunk with `metadata.processorId` and `metadata.code` (SP4 renders it).
 */

export const TENANT_BUDGET_GUARD_ID = "tenant-budget-guard";

export type BudgetGuardCode = "BUDGET_EXCEEDED" | "BUDGET_UNAVAILABLE";

export type BudgetGuardTripwire = {
  readonly processorId: typeof TENANT_BUDGET_GUARD_ID;
  readonly code: BudgetGuardCode;
};

export const createTenantBudgetGuard = (deps: {
  readonly usage: Pick<UsagePort, "checkTenantBudget">;
}): InputProcessor<BudgetGuardTripwire> => ({
  id: TENANT_BUDGET_GUARD_ID,
  name: "Tenant budget guard",
  description: "Refuses the run when the organization reached its monthly spend or token cap.",
  processInput: async ({ messages, requestContext, abort }: ProcessInputArgs<BudgetGuardTripwire>) => {
    const stop = (code: BudgetGuardCode): never =>
      abort(code, { metadata: { processorId: TENANT_BUDGET_GUARD_ID, code } });
    const context = readAgentContext(requestContext);
    if (!context.ok) return stop("BUDGET_UNAVAILABLE");
    let check: Awaited<ReturnType<UsagePort["checkTenantBudget"]>>;
    try {
      check = await deps.usage.checkTenantBudget({ tenantId: context.data.context.tenantId });
    } catch {
      return stop("BUDGET_UNAVAILABLE");
    }
    return check.allowed ? messages : stop(check.reason);
  },
});
