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

/** Monthly caps without the alert threshold (plan limits, staff override, tenant self-cap). */
export type BudgetCapsInput = { readonly monthlyMicroUsd: number; readonly monthlyTokens: number };

export type TenantCaps = { readonly caps: BudgetCapsInput; readonly source: "override" | "plan" | "default" };

/**
 * Caps in force for a tenant (SP5, decision 0039 amendment): the staff override, else the plan's
 * limits, else the platform default; then the tenant's own cap lowers either value, never raises it.
 * The result is what `usage.tenant_budgets` stores and `checkTenantBudget` enforces.
 */
export const resolveTenantCaps = (input: {
  readonly plan: BudgetCapsInput | null;
  readonly override: BudgetCapsInput | null;
  readonly selfCap: BudgetCapsInput | null;
}): TenantCaps => {
  const base: TenantCaps =
    input.override !== null
      ? { caps: input.override, source: "override" }
      : input.plan !== null
        ? { caps: input.plan, source: "plan" }
        : { caps: { monthlyMicroUsd: DEFAULT_PLAN_BUDGET.monthlyMicroUsd, monthlyTokens: DEFAULT_PLAN_BUDGET.monthlyTokens }, source: "default" };
  if (input.selfCap === null) return base;
  return {
    source: base.source,
    caps: {
      monthlyMicroUsd: Math.min(base.caps.monthlyMicroUsd, input.selfCap.monthlyMicroUsd),
      monthlyTokens: Math.min(base.caps.monthlyTokens, input.selfCap.monthlyTokens),
    },
  };
};

/** True when a tenant's own cap stays within the caps above it (it may only lower them). */
export const selfCapWithin = (selfCap: BudgetCapsInput, base: BudgetCapsInput): boolean =>
  selfCap.monthlyMicroUsd <= base.monthlyMicroUsd && selfCap.monthlyTokens <= base.monthlyTokens;
