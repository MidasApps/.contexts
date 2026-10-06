import type { AgentCatalogEntry, RegionalSettings, WorkflowCatalogEntry } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { ResolveAccessContext } from "#/services/identity/application/use-cases/resolve-access-context.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import type { WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";
import { buildTenantCatalogRoutes } from "./tenant-catalog-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const REGIONAL: RegionalSettings = {
  locale: "pt-BR",
  displayTimeZone: "America/Sao_Paulo",
  nodeTimeZone: "America/Sao_Paulo",
  currency: "BRL",
};

const AGENT: AgentCatalogEntry = {
  key: "knowledge",
  name: "Knowledge",
  description: "Answers from the knowledge base.",
  source: "core",
  moduleId: null,
  enabled: true,
  tools: [{ id: "knowledge.searchKnowledge", kind: "read", source: "core" }],
  skills: [{ name: "knowledge-citations", description: "How to cite.", source: "core" }],
};
const WORKFLOW = {
  id: "usage-report",
  description: "Rolls up usage.",
  startable: false,
  schedulable: true,
  inputSchema: null,
} as WorkflowCatalogEntry;

const setup = () => {
  const { pipeline } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
  });
  const scopes: { op: string; scope: AgentCallScope }[] = [];
  const gateway: Pick<WorkflowRuntimeGateway, "listAgentCatalog" | "listWorkflowCatalog"> = {
    listAgentCatalog: (scope) => {
      scopes.push({ op: "agents", scope });
      return Promise.resolve({ ok: true, data: [AGENT] });
    },
    listWorkflowCatalog: (scope) => {
      scopes.push({ op: "workflows", scope });
      return Promise.resolve(
        scope.tenantId === ORG_B
          ? { ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } }
          : { ok: true, data: [WORKFLOW] },
      );
    },
  };
  const resolveAccessContext: ResolveAccessContext = ({ principal, node }) =>
    Promise.resolve(
      node.level === "organization"
        ? { tenantId: node.tenantId, principal, permissions: [], regional: REGIONAL }
        : null,
    );
  return { routes: buildTenantCatalogRoutes({ pipeline, gateway, resolveAccessContext }), scopes };
};

describe("GET /v1/agents", () => {
  it("answers the organization's agent catalog through the runtime with the caller's Bearer and tenant", async () => {
    const { routes, scopes } = setup();
    const response = await callRoute(routes, "agents.listCatalog", `/v1/agents?organizationId=${ORG_A}`, {
      as: "alice",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [AGENT] });
    expect(scopes).toMatchObject([{ op: "agents", scope: { bearer: "alice-token", tenantId: ORG_A } }]);
  });

  it("needs core.agent-settings.read at the organization: a member and an outsider never reach the runtime", async () => {
    const { routes, scopes } = setup();
    expect(
      (await callRoute(routes, "agents.listCatalog", `/v1/agents?organizationId=${ORG_A}`, { as: "mia" })).status,
    ).toBe(403);
    expect([403, 404]).toContain(
      (await callRoute(routes, "agents.listCatalog", `/v1/agents?organizationId=${ORG_A}`, { as: "bob" })).status,
    );
    expect((await callRoute(routes, "agents.listCatalog", "/v1/agents", { as: "alice" })).status).toBe(400);
    expect((await callRoute(routes, "agents.listCatalog", `/v1/agents?organizationId=${ORG_A}`)).status).toBe(401);
    expect(scopes).toEqual([]);
  });
});

describe("GET /v1/workflows", () => {
  it("answers the workflows a member may start or schedule", async () => {
    const { routes, scopes } = setup();
    const response = await callRoute(routes, "workflows.listCatalog", `/v1/workflows?organizationId=${ORG_A}`, {
      as: "mia",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [WORKFLOW] });
    expect(scopes).toMatchObject([{ op: "workflows", scope: { bearer: "mia-token", tenantId: ORG_A } }]);
  });

  it("passes a runtime failure as the gateway code, never its body", async () => {
    const { routes } = setup();
    const response = await callRoute(routes, "workflows.listCatalog", `/v1/workflows?organizationId=${ORG_B}`, {
      as: "bob",
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  });
});
