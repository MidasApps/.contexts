import { type LlmCall, LlmCallContract } from "@core/contracts";
import { createUsageServices, fixedClock, type UsageRepository, type UsageTotals } from "@core/services";
import { describe, expect, it } from "vitest";
import { bindUsagePort, UsageRowsRejectedError } from "./usage-port-binding.ts";

const [example] = LlmCallContract.meta.examples as [LlmCall];
const ZERO: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, unpricedCalls: 0 };

const repository = (spend: UsageTotals = ZERO): UsageRepository & { rows: LlmCall[] } => {
  const rows: LlmCall[] = [];
  return {
    rows,
    insertCalls: (calls) => (rows.push(...calls), Promise.resolve(calls.length)),
    getMonthSpend: () => Promise.resolve(spend),
    getMonthByModel: () => Promise.resolve([]),
    getTenantBudget: () => Promise.resolve({ monthlyMicroUsd: 1000, monthlyTokens: 1000 }),
    setTenantBudget: () => Promise.resolve(),
  };
};

const bind = (repo: UsageRepository) => bindUsagePort(createUsageServices({ repository: repo, clock: fixedClock("2026-09-30T00:00:00.000Z") }));

describe("usage port binding", () => {
  it("records contract-valid rows", async () => {
    const repo = repository();
    await bind(repo).recordLlmCalls([example]);
    expect(repo.rows).toEqual([example]);
  });

  it("rejects a batch the contract refuses, naming only the fields", async () => {
    const error = await bind(repository())
      .recordLlmCalls([{ ...example, outputTokens: -1 }])
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UsageRowsRejectedError);
    expect((error as UsageRowsRejectedError).fields).toEqual(["0.outputTokens"]);
  });

  it("answers the budget check from the ledger", async () => {
    expect(await bind(repository({ ...ZERO, costMicroUsd: 1000 })).checkTenantBudget({ tenantId: "t1" })).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });
  });
});
