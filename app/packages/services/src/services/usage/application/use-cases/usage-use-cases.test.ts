import { type LlmCall, LlmCallContract } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock/clock.ts";
import type { StoredBudget, UsageBreakdowns, UsageRepository, UsageTotals } from "../ports/usage-repository.ts";
import { BudgetTenantMissingError, makeCheckTenantBudget } from "./check-tenant-budget.ts";
import { makeGetUsageSummary } from "./get-usage-summary.ts";
import { makeRecordLlmCalls } from "./record-llm-calls.ts";

const [example] = LlmCallContract.meta.examples as [LlmCall];
const clock = fixedClock("2026-09-30T12:00:00.000Z");
const ZERO: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, unpricedCalls: 0 };

const fakeRepository = (
  state: { spend?: UsageTotals; budget?: StoredBudget | null; breakdowns?: UsageBreakdowns } = {},
) => {
  const inserted: LlmCall[] = [];
  const monthStarts: Date[] = [];
  const breakdownMonths: Date[] = [];
  const repository: UsageRepository = {
    insertCalls: (calls) => {
      inserted.push(...calls);
      return Promise.resolve(calls.length);
    },
    insertAgentRuns: (runs) => Promise.resolve(runs.length),
    getMonthSpend: ({ monthStart }) => {
      monthStarts.push(monthStart);
      return Promise.resolve(state.spend ?? ZERO);
    },
    getMonthByModel: () => Promise.resolve([]),
    getMonthBreakdowns: ({ monthStart }) => {
      breakdownMonths.push(monthStart);
      return Promise.resolve(state.breakdowns ?? { byDay: [], byAgent: [], byUser: [] });
    },
    getTenantBudget: () => Promise.resolve(state.budget ?? null),
    setTenantBudget: () => Promise.resolve(),
  };
  return { repository, inserted, monthStarts, breakdownMonths };
};

describe("recordLlmCalls", () => {
  it("stores rows that match the usage.LlmCall contract", async () => {
    const { repository, inserted } = fakeRepository();
    expect(await makeRecordLlmCalls({ repository })([example])).toEqual({ ok: true, data: { recorded: 1 } });
    expect(inserted).toEqual([example]);
  });

  it("refuses the whole batch when a row breaks the contract, naming the field", async () => {
    const { repository, inserted } = fakeRepository();
    const result = await makeRecordLlmCalls({ repository })([example, { ...example, inputTokens: -1 }]);
    expect(result).toEqual({
      ok: false,
      error: { code: "VALIDATION_FAILED", details: [{ field: "1.inputTokens", issue: "TOO_SMALL" }] },
    });
    expect(inserted).toEqual([]);
  });
});

describe("checkTenantBudget", () => {
  it("reads the current UTC month and uses the plan default without a stored budget", async () => {
    const { repository, monthStarts } = fakeRepository({ spend: { ...ZERO, costMicroUsd: 40_000_000 } });
    expect(await makeCheckTenantBudget({ repository, clock })({ tenantId: "t1" })).toEqual({
      allowed: true,
      alert: true,
    });
    expect(monthStarts).toEqual([new Date("2026-09-01T00:00:00.000Z")]);
  });

  it("counts input and output tokens against the token cap", async () => {
    const { repository } = fakeRepository({
      spend: { ...ZERO, inputTokens: 60, outputTokens: 40 },
      budget: { monthlyMicroUsd: 1000, monthlyTokens: 100 },
    });
    expect(await makeCheckTenantBudget({ repository, clock })({ tenantId: "t1" })).toEqual({
      allowed: false,
      reason: "BUDGET_EXCEEDED",
    });
  });

  it("never defaults a tenant", async () => {
    const { repository } = fakeRepository();
    await expect(makeCheckTenantBudget({ repository, clock })({ tenantId: " " })).rejects.toBeInstanceOf(
      BudgetTenantMissingError,
    );
  });

  it("propagates a repository failure so the guard fails closed", async () => {
    const { repository } = fakeRepository();
    const failing: UsageRepository = { ...repository, getMonthSpend: () => Promise.reject(new Error("db down")) };
    await expect(makeCheckTenantBudget({ repository: failing, clock })({ tenantId: "t1" })).rejects.toThrow("db down");
  });
});

describe("getUsageSummary", () => {
  it("refuses a malformed month", async () => {
    const { repository } = fakeRepository();
    const result = await makeGetUsageSummary({ repository, clock })({ tenantId: "t1", month: "2026-13" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", details: [{ field: "month" }] } });
  });

  it("summarizes the requested month with the caps in force", async () => {
    const { repository, monthStarts } = fakeRepository({ budget: { monthlyMicroUsd: 0, monthlyTokens: 5 } });
    const result = await makeGetUsageSummary({ repository, clock })({ tenantId: "t1", month: "2026-08" });
    expect(result).toMatchObject({
      ok: true,
      data: { month: "2026-08", budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 5, alertThresholdPercent: 80 } },
    });
    expect(monthStarts).toEqual([new Date("2026-08-01T00:00:00.000Z")]);
  });

  it("adds the month's breakdowns per day, agent and user from the same ledger month", async () => {
    const totals: UsageTotals = { ...ZERO, calls: 2, costMicroUsd: 500 };
    const breakdowns: UsageBreakdowns = {
      byDay: [{ day: "2026-08-03", totals }],
      byAgent: [{ agentId: "knowledge", totals }],
      byUser: [{ userId: null, totals }],
    };
    const { repository, breakdownMonths } = fakeRepository({ breakdowns });
    const result = await makeGetUsageSummary({ repository, clock })({ tenantId: "t1", month: "2026-08" });
    expect(result).toMatchObject({ ok: true, data: breakdowns });
    expect(breakdownMonths).toEqual([new Date("2026-08-01T00:00:00.000Z")]);
  });
});
