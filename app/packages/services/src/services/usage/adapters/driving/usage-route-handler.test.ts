import { describe, expect, it } from "vitest";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { UsageRepository, UsageTotals } from "../../application/ports/usage-repository.ts";
import { makeGetUsageSummary } from "../../application/use-cases/get-usage-summary.ts";
import { buildUsageRoutes } from "./usage-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const TOTALS: UsageTotals = { calls: 3, inputTokens: 900, outputTokens: 300, costMicroUsd: 1200, unpricedCalls: 1 };
const EMPTY: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, unpricedCalls: 0 };

const setup = () => {
  const { pipeline, clock } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
  });
  const reads: { tenantId: string; monthStart: string }[] = [];
  // Only organization A spent anything, so a leak across tenants would show its totals.
  const repository: UsageRepository = {
    insertCalls: () => Promise.resolve(0),
    getMonthSpend: ({ tenantId, monthStart }) => {
      reads.push({ tenantId, monthStart: monthStart.toISOString() });
      return Promise.resolve(tenantId === ORG_A ? TOTALS : EMPTY);
    },
    getMonthByModel: ({ tenantId }) => Promise.resolve(tenantId === ORG_A ? [{ provider: "google", model: "gemini-3.5-flash", totals: TOTALS }] : []),
    getTenantBudget: ({ tenantId }) => Promise.resolve(tenantId === ORG_A ? { monthlyMicroUsd: 5000, monthlyTokens: 9000 } : null),
    setTenantBudget: () => Promise.resolve(),
  };
  const routes = buildUsageRoutes({ pipeline, getUsageSummary: makeGetUsageSummary({ repository, clock }) });
  return { routes, reads };
};

const json = async <T>(response: Response) => (await response.json()) as T;

describe("GET /v1/usage", () => {
  it("answers the organization's month totals, per-model breakdown and caps in force", async () => {
    const { routes, reads } = setup();
    const response = await callRoute(routes, "usage.getSummary", `/v1/usage?organizationId=${ORG_A}`, { as: "alice" });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      data: {
        tenantId: ORG_A,
        month: "2026-10",
        totals: TOTALS,
        budget: { monthlyMicroUsd: 5000, monthlyTokens: 9000, alertThresholdPercent: 80 },
        byModel: [{ provider: "google", model: "gemini-3.5-flash", totals: TOTALS }],
      },
    });
    expect(reads).toEqual([{ tenantId: ORG_A, monthStart: "2026-10-01T00:00:00.000Z" }]);
  });

  it("reads an earlier month when asked", async () => {
    const { routes, reads } = setup();
    const response = await callRoute(routes, "usage.getSummary", `/v1/usage?organizationId=${ORG_A}&month=2026-08`, { as: "alice" });
    expect(await json(response)).toMatchObject({ data: { month: "2026-08" } });
    expect(reads).toEqual([{ tenantId: ORG_A, monthStart: "2026-08-01T00:00:00.000Z" }]);
  });

  it("refuses a member without core.usage.read and an admin of another organization, without reading the ledger", async () => {
    const { routes, reads } = setup();
    expect((await callRoute(routes, "usage.getSummary", `/v1/usage?organizationId=${ORG_A}`, { as: "mia" })).status).toBe(403);
    const other = await callRoute(routes, "usage.getSummary", `/v1/usage?organizationId=${ORG_A}`, { as: "bob" });
    expect([403, 404]).toContain(other.status);
    expect((await callRoute(routes, "usage.getSummary", `/v1/usage?organizationId=${ORG_A}`)).status).toBe(401);
    expect(reads).toEqual([]);
  });

  it("rejects a malformed month and a user call without an organization", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "usage.getSummary", `/v1/usage?organizationId=${ORG_A}&month=2026-13`, { as: "alice" })).status).toBe(400);
    expect((await callRoute(routes, "usage.getSummary", "/v1/usage", { as: "alice" })).status).toBe(400);
  });
});
