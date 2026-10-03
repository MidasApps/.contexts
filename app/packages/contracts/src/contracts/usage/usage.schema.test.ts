import { describe, expect, expectTypeOf, it } from "vitest";
import type { TenantId } from "../primitives/ids.schema.ts";
import { LlmCallContract, LlmCallSchema, type LlmCall } from "./llm-call.schema.ts";
import { UsageSummaryContract, UsageSummarySchema, type UsageSummary } from "./usage-summary.schema.ts";

const contracts = [LlmCallContract, UsageSummaryContract];

describe("usage contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: every example parses", (_id, contract) => {
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
  });

  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: rejects an unknown key", (_id, contract) => {
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
  });

  it("brands tenant ids", () => {
    expectTypeOf<LlmCall["tenantId"]>().toEqualTypeOf<TenantId>();
    expectTypeOf<UsageSummary["tenantId"]>().toEqualTypeOf<TenantId>();
  });

  it("describes an llm call as a view", () => {
    expect(LlmCallContract.meta.kind).toBe("view");
  });
});

describe("LlmCallSchema", () => {
  const [example] = LlmCallContract.meta.examples as [Record<string, unknown>];

  it("keeps cost as integer micro-USD, null when the price is unknown", () => {
    expect(LlmCallSchema.safeParse({ ...example, costMicroUsd: null }).success).toBe(true);
    expect(LlmCallSchema.safeParse({ ...example, costMicroUsd: 1.5 }).success).toBe(false);
    expect(LlmCallSchema.safeParse({ ...example, costMicroUsd: "150" }).success).toBe(false);
  });

  it("rejects negative token counts", () => {
    expect(LlmCallSchema.safeParse({ ...example, inputTokens: -1 }).success).toBe(false);
  });
});

describe("UsageSummarySchema", () => {
  const [example] = UsageSummaryContract.meta.examples as [Record<string, unknown>];

  it("uses a YYYY-MM month", () => {
    expect(UsageSummarySchema.safeParse({ ...example, month: "2026-9" }).success).toBe(false);
  });

  it("breaks the month down by UTC day, agent and user; service calls have no user", () => {
    const totals = { calls: 1, inputTokens: 10, outputTokens: 5, costMicroUsd: 100, unpricedCalls: 0 };
    const summary = { ...example, byDay: [{ day: "2026-09-30", totals }], byAgent: [{ agentId: "assistant", totals }], byUser: [{ userId: null, totals }] };
    expect(UsageSummarySchema.safeParse(summary).success).toBe(true);
    expect(UsageSummarySchema.safeParse({ ...summary, byDay: [{ day: "2026-09", totals }] }).success).toBe(false);
    expect(UsageSummarySchema.safeParse({ ...summary, byAgent: [{ agentId: "", totals }] }).success).toBe(false);
  });

  it("marks the per-user breakdown as personal data", () => {
    expect(UsageSummaryContract.meta.pii).toBe("personal");
  });
});
