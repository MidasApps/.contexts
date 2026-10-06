/** Where a month of use stands against a cap: below the alert threshold, at or above it, or over the cap. */
export type BudgetLevel = "ok" | "alert" | "over";

export type BudgetUse = {
  /** `used / cap`, or `null` when the cap is 0 (nothing is allowed, so there is no ratio). */
  readonly ratio: number | null;
  readonly level: BudgetLevel;
};

/**
 * The state of one cap (spend or tokens). The caps are hard: the budget guard refuses calls once
 * `used >= cap`, so reaching the cap already reads as `over`.
 * @param thresholdPercent percent of the cap that triggers the alert (below 100).
 */
export const budgetUse = (used: number, cap: number, thresholdPercent: number): BudgetUse => {
  if (cap <= 0) return { ratio: null, level: "over" };
  const ratio = used / cap;
  if (ratio >= 1) return { ratio, level: "over" };
  return { ratio, level: ratio * 100 >= thresholdPercent ? "alert" : "ok" };
};

/** Recent months as `YYYY-MM` in UTC, the current one first. */
export const recentMonths = (now: Date, count: number): string[] =>
  Array.from({ length: count }, (_unused, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
