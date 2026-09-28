/**
 * Sprint 3.D, Task 17 — RED then GREEN para `checkBudget`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { checkBudget } from '../cost-budget';

describe('checkBudget', () => {
  afterEach(() => {
    delete process.env.EVAL_DAILY_BUDGET_USD;
  });

  it('alert + block when estimated $50 vs budget $30 (1.66x)', () => {
    const r = checkBudget({
      historicalAvgCostUsdPerCall: 0.05,
      plannedCalls: 1000,
      budgetUsd: 30,
    });
    expect(r.estimatedUsd).toBeCloseTo(50, 5);
    expect(r.budgetUsd).toBe(30);
    expect(r.alert).toBe(true);
    expect(r.blocked).toBe(true);
  });

  it('no alert when estimated $20 vs budget $30', () => {
    const r = checkBudget({
      historicalAvgCostUsdPerCall: 0.02,
      plannedCalls: 1000,
      budgetUsd: 30,
    });
    expect(r.estimatedUsd).toBeCloseTo(20, 5);
    expect(r.alert).toBe(false);
    expect(r.blocked).toBe(false);
  });

  it('alert mas nao block quando estimated entre 1.0x e 1.2x do budget', () => {
    const r = checkBudget({
      historicalAvgCostUsdPerCall: 0.033,
      plannedCalls: 1000,
      budgetUsd: 30,
    });
    expect(r.estimatedUsd).toBeCloseTo(33, 5);
    expect(r.alert).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('usa env EVAL_DAILY_BUDGET_USD quando budgetUsd nao provido', () => {
    process.env.EVAL_DAILY_BUDGET_USD = '50';
    const r = checkBudget({
      historicalAvgCostUsdPerCall: 0.04,
      plannedCalls: 1000,
    });
    expect(r.budgetUsd).toBe(50);
    expect(r.estimatedUsd).toBeCloseTo(40, 5);
    expect(r.alert).toBe(false);
  });

  it('default budget = 30 quando sem env nem opt', () => {
    const r = checkBudget({
      historicalAvgCostUsdPerCall: 0.001,
      plannedCalls: 100,
    });
    expect(r.budgetUsd).toBe(30);
  });
});
