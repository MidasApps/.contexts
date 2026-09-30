import { describe, expect, it } from "vitest";
import { ALERT_THRESHOLD_PERCENT, DEFAULT_PLAN_BUDGET, evaluateBudget, resolveBudget } from "./budget-policy.ts";

describe("resolveBudget", () => {
  it("keeps valid tenant caps", () => {
    expect(resolveBudget({ monthlyMicroUsd: 10_000_000, monthlyTokens: 5_000_000 })).toEqual({
      monthlyMicroUsd: 10_000_000,
      monthlyTokens: 5_000_000,
      alertThresholdPercent: ALERT_THRESHOLD_PERCENT,
    });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["zero", { monthlyMicroUsd: 0, monthlyTokens: 0 }],
    ["negative", { monthlyMicroUsd: -1, monthlyTokens: -5 }],
    ["non numeric", { monthlyMicroUsd: "lots", monthlyTokens: "many" }],
    ["fractional", { monthlyMicroUsd: 1.5, monthlyTokens: 2.5 }],
    ["not finite", { monthlyMicroUsd: Number.POSITIVE_INFINITY, monthlyTokens: Number.NaN }],
  ])("falls back to the plan default for %s config (never no cap)", (_label, config) => {
    expect(resolveBudget(config)).toEqual(DEFAULT_PLAN_BUDGET);
  });

  it("falls back per cap: a valid token cap survives an invalid spend cap", () => {
    expect(resolveBudget({ monthlyMicroUsd: 0, monthlyTokens: 7 })).toEqual({ ...DEFAULT_PLAN_BUDGET, monthlyTokens: 7 });
  });

  it("puts the alert threshold at 80 %, below the cap", () => {
    expect(DEFAULT_PLAN_BUDGET.alertThresholdPercent).toBe(80);
    expect(ALERT_THRESHOLD_PERCENT).toBeLessThan(100);
  });
});

describe("evaluateBudget", () => {
  const budget = { monthlyMicroUsd: 1000, monthlyTokens: 100, alertThresholdPercent: 80 };

  it("allows spend below the alert threshold without an alert", () => {
    expect(evaluateBudget({ budget, spend: { costMicroUsd: 799, tokens: 79 } })).toEqual({ allowed: true, alert: false });
  });

  it("alerts at 80 % of either cap and still allows", () => {
    expect(evaluateBudget({ budget, spend: { costMicroUsd: 800, tokens: 0 } })).toEqual({ allowed: true, alert: true });
    expect(evaluateBudget({ budget, spend: { costMicroUsd: 0, tokens: 80 } })).toEqual({ allowed: true, alert: true });
  });

  it("refuses at the spend cap", () => {
    expect(evaluateBudget({ budget, spend: { costMicroUsd: 1000, tokens: 0 } })).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });
  });

  it("refuses at the token cap even when every call was unpriced", () => {
    expect(evaluateBudget({ budget, spend: { costMicroUsd: 0, tokens: 100 } })).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });
  });
});
