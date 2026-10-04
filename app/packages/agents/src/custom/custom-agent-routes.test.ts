import type { AgentCatalogEntry, CustomAgentRuntimeOptions } from "@core/contracts";
import { AgentCatalogEntrySchema, CustomAgentRuntimeOptionsSchema } from "@core/contracts";
import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { createSkill } from "@mastra/core/skills";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ConnectorToolsResolver } from "../connectors/connector-registry.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createTenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort, createFakeCustomAgentsPort, createFakeSettingsPort } from "../testing/fake-ports.ts";
import { defineCoreTool } from "../tools/define-core-tool.ts";
import { createToolRegistry } from "../tools/tool-registry.ts";
import { buildCustomAgent, buildCustomSkill, CUSTOM_AGENT_TEST_ID, OTHER_TENANT } from "./custom-agent.fixture.ts";
import { createCustomAgentLoader } from "./custom-agent-loader.ts";
import { createCustomAgentRoutes, customCatalogEntriesOf, type CustomAgentRouteDeps, handleCustomAgentOptions, handleInvalidateCustomAgents } from "./custom-agent-routes.ts";

const tool = (id: string, permission: string, kind: "read" | "mutation" = "read") =>
  defineCoreTool({
    id,
    description: `Test tool ${id} for the custom agent routes.`,
    kind,
    permission,
    inputSchema: z.strictObject({}),
    outputSchema: z.strictObject({ ok: z.boolean() }),
    execute: () => Promise.resolve({ ok: true }),
  });

const registryOf = () => {
  const registry = createToolRegistry({ access: createFakeAccessPort({}), audit: createFakeAuditPort(), approvals: createFakeApprovalPort() });
  for (const definition of [
    tool("catalog.listEntities", "core.catalog.read"),
    tool("knowledge.searchKnowledge", "core.knowledge.read"),
    tool("web.search", "core.web-tools.use"),
    tool("command.example.CreateNoteCommand", "example.note.create", "mutation"),
  ]) {
    registry.register(definition);
  }
  return registry;
};

const coreSkills = { "knowledge-citations": createSkill({ name: "knowledge-citations", description: "How to cite.", instructions: "Cite." }) };
const noConnectors = Object.assign(() => Promise.resolve({}), { close: () => Promise.resolve() }) as ConnectorToolsResolver;
const silentLogger = { info: () => undefined, error: () => undefined };

const setup = (permissions: readonly string[], enabledAgents: readonly string[] = ["knowledge", "data", "action", "example"]) => {
  const port = createFakeCustomAgentsPort({ agents: [buildCustomAgent()] });
  const loader = createCustomAgentLoader(port);
  const deps: CustomAgentRouteDeps = {
    access: createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions }] }),
    registry: registryOf(),
    moduleIds: ["example"],
    tenantSettings: createTenantAgentSettingsReader(createFakeSettingsPort({ enabledAgents: [...enabledAgents] })),
    coreSkills,
    loader,
    logger: silentLogger,
  };
  return { deps, port, loader };
};

const inputs = (permissions: readonly string[]) => ({ mastra: {} as Mastra, requestContext: new RequestContext<unknown>(buildAgentContextEntries({ permissions })) });

describe("custom agent runtime routes", () => {
  it("registers both routes as authenticated routes under the tenant catalog", () => {
    const routes = createCustomAgentRoutes(setup([]).deps);
    expect(routes.map((route) => [route.method, route.path, route.requiresAuth])).toEqual([
      ["GET", "/tenant-catalog/agent-options", true],
      ["POST", "/tenant-catalog/custom-agents/invalidate", true],
    ]);
  });

  it("lists the model roles, the selectable tools and the platform skills", async () => {
    const { deps } = setup(["core.agent-settings.read"]);
    const response = await handleCustomAgentOptions(deps)(inputs(["core.agent-settings.read"]));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: CustomAgentRuntimeOptions };
    expect(CustomAgentRuntimeOptionsSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.models).toEqual(["chat", "reasoning"]);
    expect(body.data.tools.map((item) => [item.id, item.kind, item.source])).toEqual([
      ["catalog.listEntities", "read", "core"],
      ["command.example.CreateNoteCommand", "mutation", "module"],
    ]);
    expect(body.data.coreSkills).toEqual([{ name: "knowledge-citations", description: "How to cite." }]);
  });

  it("lists no command of a module the organization did not enable", async () => {
    const { deps } = setup(["core.agent-settings.read"], ["knowledge", "data", "action"]);
    const response = await handleCustomAgentOptions(deps)(inputs(["core.agent-settings.read"]));
    const body = (await response.json()) as { data: CustomAgentRuntimeOptions };
    expect(body.data.tools.map((item) => item.id)).toEqual(["catalog.listEntities"]);
  });

  it("answers 403 for the options without the read permission and 401 without a context", async () => {
    const { deps } = setup(["core.chat.use"]);
    expect((await handleCustomAgentOptions(deps)(inputs(["core.chat.use"]))).status).toBe(403);
    expect((await handleCustomAgentOptions(deps)({ mastra: {} as Mastra, requestContext: new RequestContext<unknown>() })).status).toBe(401);
  });

  it("drops the caller's tenant's cached records on invalidate, with the update permission only", async () => {
    const { deps, port, loader } = setup(["core.agent-settings.update"]);
    const key = { tenantId: TEST_TENANT, agentId: CUSTOM_AGENT_TEST_ID };
    await loader.load(key);
    expect((await handleInvalidateCustomAgents(deps)(inputs(["core.agent-settings.update"]))).status).toBe(204);
    await loader.load(key);
    expect(port.reads).toHaveLength(2);
    const reader = setup(["core.agent-settings.read"]);
    expect((await handleInvalidateCustomAgents(reader.deps)(inputs(["core.agent-settings.read"]))).status).toBe(403);
  });
});

describe("custom agents in the tenant catalog", () => {
  const catalogDeps = (agents = [buildCustomAgent()], skills = [buildCustomSkill()], connectorTools = noConnectors) => ({
    customAgents: createFakeCustomAgentsPort({ agents, skills }),
    registry: registryOf(),
    moduleIds: ["example"],
    coreSkills,
    connectorTools,
  });
  const input = { tenantId: TEST_TENANT, requestContext: new RequestContext<unknown>(buildAgentContextEntries()) };

  it("lists the tenant's agents, enabled or not, as custom entries with what they have at run time", async () => {
    const skill = buildCustomSkill();
    const off = buildCustomSkill({ id: "Sk000000000000000002" as never, name: "off", enabled: false });
    const agents = [
      buildCustomAgent({ tools: ["catalog.listEntities", "missing.tool", "web.search"], coreSkills: ["knowledge-citations", "nope"], customSkills: [skill.id, off.id], knowledgeScope: "organization" }),
      buildCustomAgent({ id: "Ag000000000000000002" as never, name: "Second", enabled: false }),
      buildCustomAgent({ id: "Ag000000000000000003" as never, tenantId: OTHER_TENANT as never }),
    ];
    const entries = await customCatalogEntriesOf(catalogDeps(agents, [skill, off]), input);
    expect(entries.map((entry) => [entry.key, entry.source, entry.enabled])).toEqual([
      [CUSTOM_AGENT_TEST_ID, "custom", true],
      ["Ag000000000000000002", "custom", false],
    ]);
    expect(entries[0]?.tools).toEqual([
      { id: "catalog.listEntities", kind: "read", source: "core" },
      { id: "knowledge.searchKnowledge", kind: "read", source: "core" },
    ]);
    expect(entries[0]?.skills).toEqual([
      { name: "knowledge-citations", description: "How to cite.", source: "core" },
      { name: "org-weekly-report", description: "How to write the weekly report.", source: "custom" },
    ]);
    for (const entry of entries) expect(AgentCatalogEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("adds the read-only connector tools only to agents that opted in", async () => {
    const connectorTools = Object.assign(() => Promise.resolve({ issues_listIssues: { id: "issues-api.listIssues" } }), { close: () => Promise.resolve() }) as unknown as ConnectorToolsResolver;
    const agents = [buildCustomAgent({ connectorTools: true }), buildCustomAgent({ id: "Ag000000000000000002" as never })];
    const entries: AgentCatalogEntry[] = await customCatalogEntriesOf(catalogDeps(agents, [], connectorTools), input);
    expect(entries[0]?.tools).toEqual([{ id: "issues-api.listIssues", kind: "read", source: "connector" }]);
    expect(entries[1]?.tools).toEqual([]);
  });

  it("answers nothing for a tenant without custom agents", async () => {
    expect(await customCatalogEntriesOf(catalogDeps([]), input)).toEqual([]);
  });
});
