import type { OrganizationAdminSummary } from "@core/contracts";

/** Share of the monthly cap that raises the alert (governance "Custo": 80 %). */
export const BUDGET_ALERT_RATIO = 0.8;

export type BudgetLevel = "ok" | "alert" | "over";

export type BudgetUsage = {
  /** Cost month to date over the spend cap; `null` when the cap is zero (nothing to divide by). */
  readonly ratio: number | null;
  readonly level: BudgetLevel;
};

/**
 * How far an organization is into its monthly spend cap: `alert` from 80 %, `over` from 100 %. A
 * zero cap with any cost is `over` (the budget guard refuses every run).
 */
export const budgetUsage = (
  organization: Pick<OrganizationAdminSummary, "budget" | "costMtdMicroUsd">,
): BudgetUsage => {
  const cap = organization.budget.caps.monthlyMicroUsd;
  if (cap === 0) return { ratio: null, level: organization.costMtdMicroUsd > 0 ? "over" : "ok" };
  const ratio = organization.costMtdMicroUsd / cap;
  return { ratio, level: ratio >= 1 ? "over" : ratio >= BUDGET_ALERT_RATIO ? "alert" : "ok" };
};
