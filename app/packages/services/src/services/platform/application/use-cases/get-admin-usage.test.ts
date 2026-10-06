import { describe, expect, it } from "vitest";
import { fixedClock } from "#/services/shared/clock/clock.ts";
import { createInMemoryConsoleStores } from "../../adapters/driven/in-memory-console-stores.ts";
import { makeGetAdminUsage } from "./get-admin-usage.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const row = (overrides: Record<string, unknown>) => ({
  tenantId: ORG_A,
  day: "2026-10-01",
  provider: "google",
  model: "gemini-3.5-flash",
  calls: 1,
  inputTokens: 100,
  outputTokens: 10,
  costMicroUsd: 50,
  unpricedCalls: 0,
  ...overrides,
});

const setup = () => {
  const memory = createInMemoryConsoleStores({ organizations: [{ id: ORG_A }, { id: ORG_B, status: "suspended" }] });
  memory.usageRows.push(
    row({}),
    row({ calls: 2, costMicroUsd: 70 }),
    row({ day: "2026-10-03", provider: "anthropic", model: "claude", costMicroUsd: 0, unpricedCalls: 1 }),
    row({ tenantId: ORG_B, day: "2026-10-03", costMicroUsd: 500 }),
    row({ day: "2026-09-30", costMicroUsd: 9_999 }),
  );
  const getUsage = makeGetAdminUsage({
    organizations: memory.stores.organizations,
    usage: memory.stores.usage,
    clock: fixedClock("2026-10-03T12:00:00.000Z"),
  });
  return { getUsage, memory };
};

describe("getAdminUsage", () => {
  it("defaults to the UTC month to date over every live organization, suspended ones included", async () => {
    const { getUsage } = setup();
    const usage = await getUsage({ tenantId: null });
    expect(usage).toMatchObject({
      ok: true,
      data: {
        from: "2026-10-01",
        to: "2026-10-03",
        organizationId: null,
        organizations: 2,
        truncated: false,
        totals: { calls: 5, inputTokens: 400, outputTokens: 40, costMicroUsd: 620, unpricedCalls: 1 },
        generatedAt: "2026-10-03T12:00:00.000Z",
      },
    });
    expect(usage.ok && usage.data.byDay.map((day) => [day.day, day.calls, day.costMicroUsd])).toEqual([
      ["2026-10-01", 3, 120],
      ["2026-10-02", 0, 0],
      ["2026-10-03", 2, 500],
    ]);
    expect(
      usage.ok &&
        usage.data.byModel.map((model) => [model.provider, model.model, model.costMicroUsd, model.unpricedCalls]),
    ).toEqual([
      ["google", "gemini-3.5-flash", 620, 0],
      ["anthropic", "claude", 0, 1],
    ]);
  });

  it("reads one organization and a chosen range; an unknown organization is not found", async () => {
    const { getUsage } = setup();
    const one = await getUsage({ tenantId: ORG_A, from: "2026-09-30", to: "2026-10-01" });
    expect(one).toMatchObject({
      ok: true,
      data: { organizationId: ORG_A, organizations: 1, totals: { calls: 4, costMicroUsd: 10_119 } },
    });
    expect(one.ok && one.data.byDay.map((day) => day.day)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(await getUsage({ tenantId: "OrgCccccccccccccccccc" })).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("with only `to`, starts at the first day of that month", async () => {
    const { getUsage } = setup();
    const usage = await getUsage({ tenantId: ORG_A, to: "2026-09-30" });
    expect(usage).toMatchObject({
      ok: true,
      data: { from: "2026-09-01", to: "2026-09-30", totals: { costMicroUsd: 9_999 } },
    });
  });

  it("refuses an inverted range and one longer than 92 days", async () => {
    const { getUsage } = setup();
    expect(await getUsage({ tenantId: null, from: "2026-10-03", to: "2026-10-01" })).toEqual({
      ok: false,
      error: { code: "INVALID_RANGE", field: "from", issue: "AFTER_TO" },
    });
    expect(await getUsage({ tenantId: null, from: "2026-07-03", to: "2026-10-03" })).toEqual({
      ok: false,
      error: { code: "INVALID_RANGE", field: "to", issue: "RANGE_TOO_LONG" },
    });
    expect((await getUsage({ tenantId: null, from: "2026-07-04", to: "2026-10-03" })).ok).toBe(true);
  });
});
