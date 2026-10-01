import { describe, expect, it } from "vitest";
import { buildAgentSettingsRoutes } from "../../../agents/adapters/driving/agent-settings-route-handler.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import { createInMemoryConsoleStores } from "../driven/in-memory-console-stores.ts";
import { createConsoleServices } from "../../composition.ts";
import { buildAdminPlatformRoutes } from "./admin-platform-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const LIMITS = { monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000, maxConnectors: 5, features: [] };

const setup = () => {
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
  const memory = createInMemoryConsoleStores({ organizations: [{ id: ORG_A, name: "A" }, { id: ORG_B, name: "B" }] });
  const consoleServices = createConsoleServices({ ...memory.stores, audit: makeRecordAudit({ writer: auditLog, clock }), clock });
  const routes = { ...buildAdminPlatformRoutes({ pipeline, console: consoleServices }), ...buildAgentSettingsRoutes({ pipeline, console: consoleServices }) };
  return { routes, memory, auditLog };
};

const json = async <T>(response: Response) => (await response.json()) as T;
type PlanBody = { data: { id: string } };

describe("/v1/admin plans and organizations", () => {
  it("is staff only: non-staff and staff without MFA get 403, support staff may read but not write", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "admin.listPlans", "/v1/admin/plans", { as: "alice" })).status).toBe(403);
    expect(await json(await callRoute(routes, "admin.listOrganizations", "/v1/admin/organizations", { as: "nomfa" }))).toMatchObject({ error: { code: "MFA_REQUIRED" } });
    expect((await callRoute(routes, "admin.listOrganizations", "/v1/admin/organizations", { as: "sue" })).status).toBe(200);
    const write = await callRoute(routes, "admin.setOrganizationBudget", `/v1/admin/organizations/${ORG_A}/budget`, { method: "PUT", as: "sue", body: { override: null } });
    expect(write.status).toBe(403);
  });

  it("assigns a plan, materializes the caps for the budget guard and audits with targetTenantId", async () => {
    const { routes, memory, auditLog } = setup();
    const created = await callRoute(routes, "admin.createPlan", "/v1/admin/plans", { method: "POST", as: "sam", body: { name: "Pro", limits: LIMITS } });
    expect(created.status).toBe(201);
    const planId = (await json<PlanBody>(created)).data.id;
    const patched = await callRoute(routes, "admin.updateOrganization", `/v1/admin/organizations/${ORG_A}`, { method: "PATCH", as: "sam", body: { planId } });
    expect(await json(patched)).toMatchObject({ data: { id: ORG_A, planId, budget: { caps: { monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000 }, source: "plan", override: null } } });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000 });
    await callRoute(routes, "admin.setOrganizationBudget", `/v1/admin/organizations/${ORG_A}/budget`, { method: "PUT", as: "sam", body: { override: { monthlyMicroUsd: 5, monthlyTokens: 6 } } });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 5, monthlyTokens: 6 });
    expect(auditLog.entries("platform").map((entry) => [entry.action, entry.targetTenantId])).toEqual([
      ["PLAN_CREATED", undefined],
      ["ORGANIZATION_UPDATED", ORG_A],
      ["TENANT_BUDGET_UPDATED", ORG_A],
    ]);
  });

  it("re-materializes every organization on a plan when the plan changes, and suspends an organization", async () => {
    const { routes, memory } = setup();
    const planId = (await json<PlanBody>(await callRoute(routes, "admin.createPlan", "/v1/admin/plans", { method: "POST", as: "sam", body: { name: "Pro", limits: LIMITS } }))).data.id;
    await callRoute(routes, "admin.updateOrganization", `/v1/admin/organizations/${ORG_B}`, { method: "PATCH", as: "sam", body: { planId, status: "suspended" } });
    expect(memory.organizations.get(ORG_B)?.status).toBe("suspended");
    await callRoute(routes, "admin.updatePlan", `/v1/admin/plans/${planId}`, { method: "PUT", as: "sam", body: { name: "Pro", limits: { ...LIMITS, monthlyMicroUsd: 1_000 } } });
    expect(memory.budgets.get(ORG_B)?.monthlyMicroUsd).toBe(1_000);
    expect((await callRoute(routes, "admin.updateOrganization", "/v1/admin/organizations/OrgCccccccccccccccccc", { method: "PATCH", as: "sam", body: { status: "active" } })).status).toBe(404);
    const unknownPlan = await callRoute(routes, "admin.updateOrganization", `/v1/admin/organizations/${ORG_B}`, { method: "PATCH", as: "sam", body: { planId: "Nopeaaaaaaaaaaaaaaaa" } });
    expect(unknownPlan.status).toBe(400);
  });

  it("lists organizations with caps and cost, and answers the overview", async () => {
    const { routes, memory } = setup();
    memory.costs.set(ORG_A, 1_500);
    const list = await json<{ data: { id: string; costMtdMicroUsd: number; budget: { source: string } }[]; meta: unknown }>(
      await callRoute(routes, "admin.listOrganizations", "/v1/admin/organizations?limit=1", { as: "sam" }),
    );
    expect(list.data.map((org) => [org.id, org.costMtdMicroUsd, org.budget.source])).toEqual([[ORG_A, 1_500, "default"]]);
    expect(list.meta).toMatchObject({ page: { hasMore: true } });
    const overview = await json(await callRoute(routes, "admin.getOverview", "/v1/admin/overview", { as: "sam" }));
    expect(overview).toMatchObject({ data: { organizations: 2, costMtdMicroUsd: 1_500, evalStatus: "unknown" } });
  });
});

describe("agent settings", () => {
  it("serves defaults, lets the tenant lower its own cap but never raise it above the plan", async () => {
    const { routes, memory, auditLog } = setup();
    const read = await json(await callRoute(routes, "agent-settings.get", `/v1/agent-settings?organizationId=${ORG_A}`, { as: "alice" }));
    expect(read).toMatchObject({ data: { tenantId: ORG_A, enabledAgents: ["knowledge", "data", "action"], guardrails: { pii: "redact" }, budget: { monthlyMicroUsd: 50_000_000 } } });
    expect((await callRoute(routes, "agent-settings.get", `/v1/agent-settings?organizationId=${ORG_A}`, { as: "mia" })).status).toBe(403);
    const raise = await callRoute(routes, "agent-settings.update", `/v1/agent-settings?organizationId=${ORG_A}`, { method: "PATCH", as: "alice", body: { budget: { monthlyMicroUsd: 60_000_000, monthlyTokens: 1 } } });
    expect(raise.status).toBe(400);
    expect(await json(raise)).toMatchObject({ error: { code: "VALIDATION_FAILED", details: [{ field: "budget.monthlyMicroUsd", issue: "ABOVE_PLAN" }, { field: "budget.monthlyTokens", issue: "ABOVE_PLAN" }] } });
    const lower = await callRoute(routes, "agent-settings.update", `/v1/agent-settings?organizationId=${ORG_A}`, {
      method: "PATCH",
      as: "alice",
      body: { guardrails: { pii: "warn" }, budget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 } },
    });
    expect(await json(lower)).toMatchObject({ data: { guardrails: { pii: "warn" }, budget: { monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 }, updatedBy: "alice" } });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 });
    expect(auditLog.entries("tenant")).toEqual([expect.objectContaining({ action: "AGENT_SETTINGS_UPDATED", tenantId: ORG_A, changes: ["guardrails", "budget"] })]);
  });

  it("keeps the tenant's lower cap when staff later raise the override, and audits staff edits on the platform log", async () => {
    const { routes, memory, auditLog } = setup();
    await callRoute(routes, "agent-settings.update", `/v1/agent-settings?organizationId=${ORG_A}`, { method: "PATCH", as: "alice", body: { budget: { monthlyMicroUsd: 10, monthlyTokens: 10 } } });
    await callRoute(routes, "admin.setOrganizationBudget", `/v1/admin/organizations/${ORG_A}/budget`, { method: "PUT", as: "sam", body: { override: { monthlyMicroUsd: 999, monthlyTokens: 999 } } });
    expect(memory.budgets.get(ORG_A)).toEqual({ monthlyMicroUsd: 10, monthlyTokens: 10 });
    const staff = await callRoute(routes, "admin.updateOrganizationAgentSettings", `/v1/admin/organizations/${ORG_B}/agent-settings`, { method: "PUT", as: "sam", body: { enabledAgents: ["knowledge"] } });
    expect(await json(staff)).toMatchObject({ data: { tenantId: ORG_B, enabledAgents: ["knowledge"] } });
    expect(auditLog.entries("platform").at(-1)).toMatchObject({ action: "AGENT_SETTINGS_UPDATED", targetTenantId: ORG_B });
    expect((await callRoute(routes, "admin.getOrganizationAgentSettings", `/v1/admin/organizations/${ORG_B}/agent-settings`, { as: "alice" })).status).toBe(403);
  });
});
