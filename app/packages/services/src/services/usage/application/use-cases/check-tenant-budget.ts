import type { Clock } from "#/services/shared/clock/clock.ts";
import { type BudgetDecision, evaluateBudget, resolveBudget } from "../../domain/budget-policy.ts";
import type { UsageRepository } from "../ports/usage-repository.ts";
import { utcMonthStart } from "./usage-month.ts";

/** Bug guard: a budget check without a tenant (never default one). */
export class BudgetTenantMissingError extends Error {
  readonly code = "BUDGET_TENANT_MISSING";

  constructor() {
    super("budget check without tenantId");
    this.name = "BudgetTenantMissingError";
  }
}

export type CheckTenantBudget = (input: { readonly tenantId: string }) => Promise<BudgetDecision>;

/**
 * Hard monthly cap of a tenant (SP3 spec §12, decision 0026): month-to-date
 * spend and tokens from the ledger against the caps of `budget-policy.ts`.
 * Tokens of unpriced calls count against the token cap.
 * @throws {BudgetTenantMissingError} for an empty tenant; infrastructure errors propagate,
 * and the caller (the tenant budget guard) fails closed on them.
 */
export const makeCheckTenantBudget =
  (deps: { readonly repository: UsageRepository; readonly clock: Clock }): CheckTenantBudget =>
  async ({ tenantId }) => {
    if (tenantId.trim() === "") throw new BudgetTenantMissingError();
    const monthStart = utcMonthStart(deps.clock.now());
    const [stored, spend] = await Promise.all([
      deps.repository.getTenantBudget({ tenantId }),
      deps.repository.getMonthSpend({ tenantId, monthStart }),
    ]);
    return evaluateBudget({
      budget: resolveBudget(stored),
      spend: { costMicroUsd: spend.costMicroUsd, tokens: spend.inputTokens + spend.outputTokens },
    });
  };
