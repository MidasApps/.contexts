import { describe, expect, it } from "vitest";
import { buildAgentSettingsRoutes } from "#/services/agents/adapters/driving/agent-settings-route-handler.ts";
import { makeRecordAudit } from "#/services/audit/application/use-cases/record-audit.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import { createConsoleServices } from "../../composition.ts";
import { createInMemoryConsoleStores } from "../driven/in-memory-console-stores.ts";
import { buildAdminPlatformRoutes } from "./admin-platform-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const LIMITS = { monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000, maxConnectors: 5, features: [] };

const setup = (seed: Parameters<typeof createInMemoryConsoleStores>[0] = {}) => {
  const { pipeline, auditLog, clock } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
    staff: [
      { uid: "sam", role: "platform-admin", mfa: true },
      { uid: "nomfa", role: "platform-admin", mfa: false },
      { uid: "sue", role: "platform-support", mfa: true },
    ],
  });
  const memory = createInMemoryConsoleStores({
    organizations: [
      { id: ORG_A, name: "A" },
      { id: ORG_B, name: "B" },
    ],
    ...seed,
  });
  const consoleServices = createConsoleServices({
    ...memory.stores,
    audit: makeRecordAudit({ writer: auditLog, clock }),
    clock,
  });
  const routes = {
    ...buildAdminPlatformRoutes({ pipeline, console: consoleServices }),
    ...buildAgentSettingsRoutes({ pipeline, console: consoleServices }),
  };
  return { routes, memory, auditLog };
};

const json = async <T>(response: Response) => (await response.json()) as T;
type PlanBody = { data: { id: string } };

describe("/v1/admin plans and organizations", () => {
  it("is staff only: non-staff and staff without MFA get 403, support staff may read but not write", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "admin.listPlans", "/v1/admin/plans", { as: "alice" })).status).toBe(403);
    expect(
      await json(await callRoute(routes, "admin.listOrganizations", "/v1/admin/organizations", { as: "nomfa" })),
    ).toMatchObject({ error: { code: "MFA_REQUIRED" } });
    expect((await callRoute(routes, "admin.listOrganizations", "/v1/admin/organizations", { as: "sue" })).status).toBe(
      200,
    );
    const write = await callRoute(routes, "admin.setOrganizationBudget", `/v1/admin/organizations/${ORG_A}/budget`, {
      method: "PUT",
      as: "sue",
      body: { override: null },
    });
    expect(write.status).toBe(403);
  });

  it("assigns a plan, materializes the caps for the budget guard and audits with targetTenantId", async () => {
    const { routes, memory, auditLog } = setup();
    const created = await callRoute(routes, "admin.createPlan", "/v1/admin/plans", {
      method: "POST",
      as: "sam",
      body: { name: "Pro", limits: LIMITS },
    });
    expect(created.status).toBe(201);
    const planId = (await json<PlanBody>(created)).data.id;
    const patched = await callRoute(routes, "admin.updateOrganization", `/v1/admin/organizations/${ORG_A}`, {
      method: "PATCH",
      as: "sam",
      body: { planId },
    });
    expect(await json(patched)).toMatchObject({
      data: {
        id: ORG_A,
        planId,
        budget: { caps: { monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000 }, source: "plan", override: null },
      },
    });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000 });
    await callRoute(routes, "admin.setOrganizationBudget", `/v1/admin/organizations/${ORG_A}/budget`, {
      method: "PUT",
      as: "sam",
      body: { override: { monthlyMicroUsd: 5, monthlyTokens: 6 } },
    });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 5, monthlyTokens: 6 });
    expect(auditLog.entries("platform").map((entry) => [entry.action, entry.targetTenantId])).toEqual([
      ["PLAN_CREATED", undefined],
      ["ORGANIZATION_UPDATED", ORG_A],
      ["TENANT_BUDGET_UPDATED", ORG_A],
    ]);
  });

  it("re-materializes every organization on a plan when the plan changes, and suspends an organization", async () => {
    const { routes, memory } = setup();
    const planId = (
      await json<PlanBody>(
        await callRoute(routes, "admin.createPlan", "/v1/admin/plans", {
          method: "POST",
          as: "sam",
          body: { name: "Pro", limits: LIMITS },
        }),
      )
    ).data.id;
    await callRoute(routes, "admin.updateOrganization", `/v1/admin/organizations/${ORG_B}`, {
      method: "PATCH",
      as: "sam",
      body: { planId, status: "suspended" },
    });
    expect(memory.organizations.get(ORG_B)?.status).toBe("suspended");
    await callRoute(routes, "admin.updatePlan", `/v1/admin/plans/${planId}`, {
      method: "PUT",
      as: "sam",
      body: { name: "Pro", limits: { ...LIMITS, monthlyMicroUsd: 1_000 } },
    });
    expect(memory.budgets.get(ORG_B)?.monthlyMicroUsd).toBe(1_000);
    expect(
      (
        await callRoute(routes, "admin.updateOrganization", "/v1/admin/organizations/OrgCccccccccccccccccc", {
          method: "PATCH",
          as: "sam",
          body: { status: "active" },
        })
      ).status,
    ).toBe(404);
    const unknownPlan = await callRoute(routes, "admin.updateOrganization", `/v1/admin/organizations/${ORG_B}`, {
      method: "PATCH",
      as: "sam",
      body: { planId: "Nopeaaaaaaaaaaaaaaaa" },
    });
    expect(unknownPlan.status).toBe(400);
  });

  it("lists organizations with caps and cost, and answers the overview", async () => {
    const { routes, memory } = setup();
    memory.costs.set(ORG_A, 1_500);
    const list = await json<{
      data: { id: string; costMtdMicroUsd: number; budget: { source: string } }[];
      meta: unknown;
    }>(await callRoute(routes, "admin.listOrganizations", "/v1/admin/organizations?limit=1", { as: "sam" }));
    expect(list.data.map((org) => [org.id, org.costMtdMicroUsd, org.budget.source])).toEqual([
      [ORG_A, 1_500, "default"],
    ]);
    expect(list.meta).toMatchObject({ page: { hasMore: true } });
    const overview = await json(await callRoute(routes, "admin.getOverview", "/v1/admin/overview", { as: "sam" }));
    expect(overview).toMatchObject({ data: { organizations: 2, costMtdMicroUsd: 1_500, evalStatus: "unknown" } });
  });
});

describe("GET /v1/admin/organizations/{organizationId}", () => {
  it("answers the summary with the distinct member count, staff only, 404 for an unknown organization", async () => {
    const { routes, memory, auditLog } = setup({ members: { [ORG_A]: ["alice", "mia", "alice"] } });
    memory.costs.set(ORG_A, 700);
    const read = await callRoute(routes, "admin.getOrganization", `/v1/admin/organizations/${ORG_A}`, { as: "sue" });
    expect(read.status).toBe(200);
    expect(await json(read)).toMatchObject({
      data: {
        id: ORG_A,
        name: "A",
        status: "active",
        costMtdMicroUsd: 700,
        memberCount: 2,
        budget: { source: "default" },
      },
    });
    expect(
      await json(await callRoute(routes, "admin.getOrganization", `/v1/admin/organizations/${ORG_B}`, { as: "sam" })),
    ).toMatchObject({ data: { memberCount: 0 } });
    expect(
      (await callRoute(routes, "admin.getOrganization", "/v1/admin/organizations/OrgCccccccccccccccccc", { as: "sam" }))
        .status,
    ).toBe(404);
    expect(
      (await callRoute(routes, "admin.getOrganization", `/v1/admin/organizations/${ORG_A}`, { as: "alice" })).status,
    ).toBe(403);
    expect(
      await json(await callRoute(routes, "admin.getOrganization", `/v1/admin/organizations/${ORG_A}`, { as: "nomfa" })),
    ).toMatchObject({ error: { code: "MFA_REQUIRED" } });
    expect(auditLog.entries("platform").at(-1)).toMatchObject({
      action: "PLATFORM_ACCESS_DENIED",
      targetTenantId: ORG_A,
    });
  });
});

describe("GET /v1/admin/organizations?query=&status=", () => {
  const ORGS = [
    { id: "Org1aaaaaaaaaaaaaaaa", name: "Ácme Norte" },
    { id: "Org2aaaaaaaaaaaaaaaa", name: "Borealis", status: "suspended" as const },
    { id: "Org3aaaaaaaaaaaaaaaa", name: "Grupo ACME Sul" },
    { id: "Org4aaaaaaaaaaaaaaaa", name: "Acme Leste", status: "suspended" as const },
  ];
  type ListBody = { data: { id: string }[]; meta: { page: { cursor: string | null; hasMore: boolean } } };
  const list = async (routes: ReturnType<typeof setup>["routes"], search: string) =>
    json<ListBody>(
      await callRoute(routes, "admin.listOrganizations", `/v1/admin/organizations?${search}`, { as: "sam" }),
    );

  it("matches every word anywhere in the name or id, ignoring case and accents, and filters by status", async () => {
    const { routes } = setup({ organizations: ORGS });
    expect((await list(routes, "query=acme")).data.map((org) => org.id)).toEqual([
      ORGS[0]!.id,
      ORGS[2]!.id,
      ORGS[3]!.id,
    ]);
    expect((await list(routes, "query=sul%20grupo")).data.map((org) => org.id)).toEqual([ORGS[2]!.id]);
    expect((await list(routes, "query=acme&status=suspended")).data.map((org) => org.id)).toEqual([ORGS[3]!.id]);
    expect((await list(routes, "status=suspended")).data.map((org) => org.id)).toEqual([ORGS[1]!.id, ORGS[3]!.id]);
    expect((await list(routes, "query=org2aaa")).data.map((org) => org.id)).toEqual([ORGS[1]!.id]);
    expect(await list(routes, "query=nothing")).toMatchObject({
      data: [],
      meta: { page: { hasMore: false, cursor: null } },
    });
    expect(
      (await callRoute(routes, "admin.listOrganizations", "/v1/admin/organizations?status=deleted", { as: "sam" }))
        .status,
    ).toBe(400);
  });

  it("pages the matches by cursor without repeating or losing one", async () => {
    const { routes } = setup({ organizations: ORGS });
    const first = await list(routes, "query=acme&limit=2");
    expect(first.data.map((org) => org.id)).toEqual([ORGS[0]!.id, ORGS[2]!.id]);
    expect(first.meta.page.hasMore).toBe(true);
    const second = await list(routes, `query=acme&limit=2&cursor=${first.meta.page.cursor ?? ""}`);
    expect(second.data.map((org) => org.id)).toEqual([ORGS[3]!.id]);
    expect(second.meta.page).toMatchObject({ hasMore: false, cursor: null });
  });

  it("always answers the organization whose id is the text first, once", async () => {
    const { routes } = setup({
      organizations: [...ORGS, { id: "Org5aaaaaaaaaaaaaaaa", name: `About ${ORGS[3]!.id}` }],
    });
    const found = await list(routes, `query=${ORGS[3]!.id}&limit=1`);
    expect(found.data.map((org) => org.id)).toEqual([ORGS[3]!.id]);
    const rest = await list(routes, `query=${ORGS[3]!.id}&limit=1&cursor=${found.meta.page.cursor ?? ""}`);
    expect(rest.data.map((org) => org.id)).toEqual(["Org5aaaaaaaaaaaaaaaa"]);
    expect(rest.meta.page.hasMore).toBe(false);
  });
});

describe("GET /v1/admin/usage", () => {
  const seed = (memory: ReturnType<typeof setup>["memory"]): void => {
    const row = {
      provider: "google",
      model: "gemini-3.5-flash",
      calls: 2,
      inputTokens: 200,
      outputTokens: 20,
      costMicroUsd: 300,
      unpricedCalls: 0,
    };
    memory.usageRows.push(
      { tenantId: ORG_A, day: "2026-10-01", ...row },
      { tenantId: ORG_B, day: "2026-09-30", ...row, costMicroUsd: 40 },
    );
  };

  it("is staff only (support may read) and answers the month to date by day and by model", async () => {
    const { routes, memory } = setup();
    seed(memory);
    expect((await callRoute(routes, "admin.getUsage", "/v1/admin/usage", { as: "alice" })).status).toBe(403);
    expect(await json(await callRoute(routes, "admin.getUsage", "/v1/admin/usage", { as: "nomfa" }))).toMatchObject({
      error: { code: "MFA_REQUIRED" },
    });
    const usage = await callRoute(routes, "admin.getUsage", "/v1/admin/usage", { as: "sue" });
    expect(usage.status).toBe(200);
    expect(await json(usage)).toMatchObject({
      data: {
        from: "2026-10-01",
        to: "2026-10-01",
        organizationId: null,
        organizations: 2,
        totals: { calls: 2, costMicroUsd: 300 },
        byDay: [{ day: "2026-10-01", costMicroUsd: 300 }],
        byModel: [{ model: "gemini-3.5-flash", costMicroUsd: 300 }],
      },
    });
  });

  it("filters by organization and range, and refuses a bad range, a bad day and an unknown organization", async () => {
    const { routes, memory } = setup();
    seed(memory);
    const one = await json<{ data: { totals: { costMicroUsd: number }; byDay: unknown[] } }>(
      await callRoute(
        routes,
        "admin.getUsage",
        `/v1/admin/usage?organizationId=${ORG_B}&from=2026-09-29&to=2026-10-01`,
        { as: "sam" },
      ),
    );
    expect(one.data.totals.costMicroUsd).toBe(40);
    expect(one.data.byDay).toHaveLength(3);
    const inverted = await callRoute(routes, "admin.getUsage", "/v1/admin/usage?from=2026-10-02&to=2026-10-01", {
      as: "sam",
    });
    expect(inverted.status).toBe(400);
    expect(await json(inverted)).toMatchObject({
      error: { code: "VALIDATION_FAILED", details: [{ field: "from", issue: "AFTER_TO" }] },
    });
    expect(
      (await callRoute(routes, "admin.getUsage", "/v1/admin/usage?from=2026-01-01&to=2026-10-01", { as: "sam" }))
        .status,
    ).toBe(400);
    expect((await callRoute(routes, "admin.getUsage", "/v1/admin/usage?from=yesterday", { as: "sam" })).status).toBe(
      400,
    );
    expect(
      (await callRoute(routes, "admin.getUsage", "/v1/admin/usage?organizationId=OrgCccccccccccccccccc", { as: "sam" }))
        .status,
    ).toBe(404);
  });
});

describe("agent settings", () => {
  it("serves defaults, lets the tenant lower its own cap but never raise it above the plan", async () => {
    const { routes, memory, auditLog } = setup();
    const read = await json(
      await callRoute(routes, "agent-settings.get", `/v1/agent-settings?organizationId=${ORG_A}`, { as: "alice" }),
    );
    expect(read).toMatchObject({
      data: {
        tenantId: ORG_A,
        enabledAgents: ["knowledge", "data", "action"],
        guardrails: { pii: "redact" },
        budget: { monthlyMicroUsd: 50_000_000 },
      },
    });
    expect(
      (await callRoute(routes, "agent-settings.get", `/v1/agent-settings?organizationId=${ORG_A}`, { as: "mia" }))
        .status,
    ).toBe(403);
    const raise = await callRoute(routes, "agent-settings.update", `/v1/agent-settings?organizationId=${ORG_A}`, {
      method: "PATCH",
      as: "alice",
      body: { budget: { monthlyMicroUsd: 60_000_000, monthlyTokens: 1 } },
    });
    expect(raise.status).toBe(400);
    expect(await json(raise)).toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        details: [
          { field: "budget.monthlyMicroUsd", issue: "ABOVE_PLAN" },
          { field: "budget.monthlyTokens", issue: "ABOVE_PLAN" },
        ],
      },
    });
    const lower = await callRoute(routes, "agent-settings.update", `/v1/agent-settings?organizationId=${ORG_A}`, {
      method: "PATCH",
      as: "alice",
      body: { guardrails: { pii: "warn" }, budget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 } },
    });
    expect(await json(lower)).toMatchObject({
      data: {
        guardrails: { pii: "warn" },
        budget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 },
        updatedBy: "alice",
      },
    });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 });
    expect(auditLog.entries("tenant")).toEqual([
      expect.objectContaining({ action: "AGENT_SETTINGS_UPDATED", tenantId: ORG_A, changes: ["guardrails", "budget"] }),
    ]);
  });

  it("reads back the organization's own cap apart from the caps in force, and null once removed", async () => {
    const { routes } = setup();
    const url = `/v1/agent-settings?organizationId=${ORG_A}`;
    const read = async () => json(await callRoute(routes, "agent-settings.get", url, { as: "alice" }));
    expect(await read()).toMatchObject({
      data: { ownBudget: null, budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 } },
    });
    const saved = await callRoute(routes, "agent-settings.update", url, {
      method: "PATCH",
      as: "alice",
      body: { budget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 20_000_000 } },
    });
    expect(await json(saved)).toMatchObject({
      data: { ownBudget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 20_000_000 } },
    });
    await callRoute(routes, "agent-settings.update", url, {
      method: "PATCH",
      as: "alice",
      body: { guardrails: { pii: "warn" } },
    });
    expect(await read()).toMatchObject({
      data: {
        ownBudget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 20_000_000 },
        budget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 20_000_000 },
      },
    });
    const removed = await callRoute(routes, "agent-settings.update", url, {
      method: "PATCH",
      as: "alice",
      body: { budget: null },
    });
    expect(await json(removed)).toMatchObject({ data: { ownBudget: null, budget: { monthlyMicroUsd: 50_000_000 } } });
    expect(await read()).toMatchObject({ data: { ownBudget: null } });
  });

  it("keeps the tenant's lower cap when staff later raise the override, and audits staff edits on the platform log", async () => {
    const { routes, memory, auditLog } = setup();
    await callRoute(routes, "agent-settings.update", `/v1/agent-settings?organizationId=${ORG_A}`, {
      method: "PATCH",
      as: "alice",
      body: { budget: { monthlyMicroUsd: 10, monthlyTokens: 10 } },
    });
    await callRoute(routes, "admin.setOrganizationBudget", `/v1/admin/organizations/${ORG_A}/budget`, {
      method: "PUT",
      as: "sam",
      body: { override: { monthlyMicroUsd: 999, monthlyTokens: 999 } },
    });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 10, monthlyTokens: 10 });
    const staff = await callRoute(
      routes,
      "admin.updateOrganizationAgentSettings",
      `/v1/admin/organizations/${ORG_B}/agent-settings`,
      { method: "PUT", as: "sam", body: { enabledAgents: ["knowledge"] } },
    );
    expect(await json(staff)).toMatchObject({ data: { tenantId: ORG_B, enabledAgents: ["knowledge"] } });
    expect(auditLog.entries("platform").at(-1)).toMatchObject({
      action: "AGENT_SETTINGS_UPDATED",
      targetTenantId: ORG_B,
    });
    expect(
      (
        await callRoute(
          routes,
          "admin.getOrganizationAgentSettings",
          `/v1/admin/organizations/${ORG_B}/agent-settings`,
          { as: "alice" },
        )
      ).status,
    ).toBe(403);
  });
});
