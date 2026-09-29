/**
 * Sprint 3.D, Task 17 — pre-check de orcamento para evals.
 *
 * Calcula custo estimado (`historicalAvgCostUsdPerCall * plannedCalls`),
 * compara contra `budgetUsd` (default env `EVAL_DAILY_BUDGET_USD` = $30).
 *
 *   alert   = estimated > budget
 *   blocked = estimated > 1.2 * budget
 *
 * Ver `src/features/evals/README.md` para o processo de aprovacao manual
 * quando `blocked = true`.
 */

export interface BudgetCheck {
  estimatedUsd: number;
  budgetUsd: number;
  alert: boolean;
  blocked: boolean;
}

export interface CheckBudgetArgs {
  historicalAvgCostUsdPerCall: number;
  plannedCalls: number;
  /** Override do orcamento. Default: env `EVAL_DAILY_BUDGET_USD` ou 30. */
  budgetUsd?: number;
}

const DEFAULT_BUDGET_USD = 30;
const BLOCK_FACTOR = 1.2;

function resolveBudget(): number {
  const raw = process.env.EVAL_DAILY_BUDGET_USD;
  if (!raw) return DEFAULT_BUDGET_USD;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_USD;
}

export function checkBudget(args: CheckBudgetArgs): BudgetCheck {
  const { historicalAvgCostUsdPerCall, plannedCalls } = args;
  const budgetUsd = args.budgetUsd ?? resolveBudget();
  const estimatedUsd = historicalAvgCostUsdPerCall * plannedCalls;
  const alert = estimatedUsd > budgetUsd;
  const blocked = estimatedUsd > BLOCK_FACTOR * budgetUsd;
  return { estimatedUsd, budgetUsd, alert, blocked };
}
