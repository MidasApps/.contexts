/**
 * Monthly budget caps of a tenant (SP3 spec §12, decision 0026,
 * rules/governance.md "Custo de IA"). This file is the single source of the
 * caps: the tenant budget guard and the usage summary both read them here.
 * - Hard cap: spend (micro-USD) or tokens reaching the cap refuses the run.
 * - Alert threshold: 80 % of a cap (always below it), shown in the summary and
 *   alerted by SP5; it never raises the cap.
 * Invalid configuration (missing, zero, negative, fractional, non numeric) falls
 * back to the plan default for that cap, never to "no cap".
 */

export type Budget = {
  readonly monthlyMicroUsd: number;
  readonly monthlyTokens: number;
  readonly alertThresholdPercent: number;
};

export const ALERT_THRESHOLD_PERCENT = 80;

/** Plan default caps: USD 50 and 20 M tokens per month (the table in decision 0026, amendment 2026-09-30). */
export const DEFAULT_PLAN_BUDGET: Budget = {
  monthlyMicroUsd: 50_000_000,
  monthlyTokens: 20_000_000,
  alertThresholdPercent: ALERT_THRESHOLD_PERCENT,
};

const isPositiveCap = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const capOf = (config: unknown, key: "monthlyMicroUsd" | "monthlyTokens"): number => {
  const value = typeof config === "object" && config !== null ? (config as Record<string, unknown>)[key] : undefined;
  return isPositiveCap(value) ? value : DEFAULT_PLAN_BUDGET[key];
};

/** Caps in force for a tenant from its stored configuration (any shape; unknown input is untrusted). */
export const resolveBudget = (config: unknown): Budget => ({
  monthlyMicroUsd: capOf(config, "monthlyMicroUsd"),
  monthlyTokens: capOf(config, "monthlyTokens"),
  alertThresholdPercent: ALERT_THRESHOLD_PERCENT,
});

export type MonthSpend = { readonly costMicroUsd: number; readonly tokens: number };

export type BudgetDecision = { readonly allowed: true; readonly alert: boolean } | { readonly allowed: false; readonly reason: "BUDGET_EXCEEDED" };

const reachesPercent = (value: number, cap: number, percent: number): boolean => value * 100 >= cap * percent;

/** Hard cap first (either cap reached refuses), then the alert threshold of either cap. */
export const evaluateBudget = (input: { readonly budget: Budget; readonly spend: MonthSpend }): BudgetDecision => {
  const { budget, spend } = input;
  if (spend.costMicroUsd >= budget.monthlyMicroUsd || spend.tokens >= budget.monthlyTokens) return { allowed: false, reason: "BUDGET_EXCEEDED" };
  const alert =
    reachesPercent(spend.costMicroUsd, budget.monthlyMicroUsd, budget.alertThresholdPercent) ||
    reachesPercent(spend.tokens, budget.monthlyTokens, budget.alertThresholdPercent);
  return { allowed: true, alert };
};
