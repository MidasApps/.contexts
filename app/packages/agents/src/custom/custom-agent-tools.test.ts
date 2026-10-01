import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAgentContextEntries } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort, createFakeCustomAgentsPort } from "../testing/fake-ports.ts";
import { type CoreToolContext, type CoreToolDefinition, defineCoreTool } from "../tools/define-core-tool.ts";
import { createToolRegistry } from "../tools/tool-registry.ts";
import { buildCustomAgent, CUSTOM_AGENT_TEST_ID, OTHER_TENANT } from "./custom-agent.fixture.ts";
import { createCustomAgentLoader, CUSTOM_AGENT_ID_KEY } from "./custom-agent-loader.ts";
import { ceilingOfRecord, createCustomCeilingResolver, CUSTOM_AGENT_ID, scopedKnowledgeTool, selectableToolsOf, selectedToolsOf } from "./custom-agent-tools.ts";

const tool = (id: string, permission: string, kind: "read" | "mutation" = "read") =>
  defineCoreTool({
    id,
    description: `Test tool ${id} for custom agent tests.`,
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
    tool("web.scrape", "core.web-tools.use"),
    tool("command.example.CreateNoteCommand", "example.note.create", "mutation"),
    tool("admin.dangerous", "platform.staff.manage"),
  ]) {
    registry.register(definition);
  }
  return registry;
};

const PLATFORM = new Set(["core.chat.use", "core.catalog.read", "core.knowledge.read", "example.note.create", "core.web-tools.use"]);

describe("custom agent tools", () => {
  it("offers every registry tool except the knowledge search and the web tools", () => {
    expect(selectableToolsOf(registryOf()).map((definition) => definition.id)).toEqual(["catalog.listEntities", "command.example.CreateNoteCommand", "admin.dangerous"]);
  });

  it("drops selected ids that are unknown or not selectable", () => {
    const agent = buildCustomAgent({ tools: ["catalog.listEntities", "missing.tool", "web.search", "knowledge.searchKnowledge"] });
    expect(selectedToolsOf(agent, registryOf()).map((definition) => definition.id)).toEqual(["catalog.listEntities"]);
  });

  it("builds the ceiling from what the record selected, inside the platform ceiling", () => {
    const registry = registryOf();
    const plain = ceilingOfRecord(buildCustomAgent(), { registry, platformCeiling: PLATFORM });
    expect([...plain]).toEqual(["core.chat.use"]);
    const rich = ceilingOfRecord(buildCustomAgent({ tools: ["catalog.listEntities", "command.example.CreateNoteCommand", "admin.dangerous", "web.search"], knowledgeScope: "organization" }), {
      registry,
      platformCeiling: PLATFORM,
    });
    // `platform.staff.manage` is outside the platform ceiling; `web.search` is not selectable.
    expect([...rich].sort()).toEqual(["core.catalog.read", "core.chat.use", "core.knowledge.read", "example.note.create"]);
    const all = ceilingOfRecord(buildCustomAgent({ knowledgeScope: "all" }), { registry, platformCeiling: PLATFORM });
    expect([...all].sort()).toEqual(["core.catalog.read", "core.chat.use", "core.knowledge.read"]);
  });

  describe("run ceiling resolver", () => {
    const setup = (agents = [buildCustomAgent({ tools: ["catalog.listEntities"] })]) => {
      const registry = registryOf();
      const loader = createCustomAgentLoader(createFakeCustomAgentsPort({ agents }));
      return createCustomCeilingResolver({ loader, registry: () => registry, platformCeiling: PLATFORM, agentIds: [CUSTOM_AGENT_ID, `${CUSTOM_AGENT_ID}-chat`] });
    };
    const context = (entries: [string, unknown][]) => new Map<string, unknown>(entries);
    const named = (tenantId?: string) => context([...buildAgentContextEntries(tenantId === undefined ? {} : { tenantId }), [CUSTOM_AGENT_ID_KEY, CUSTOM_AGENT_TEST_ID]]);

    it("leaves other agents to their static ceiling", async () => {
      expect(await setup()({ agentId: "action", requestContext: context(buildAgentContextEntries()) })).toBeUndefined();
    });

    it("is empty for the custom agent without a loaded record", async () => {
      const resolve = setup();
      expect([...((await resolve({ agentId: CUSTOM_AGENT_ID, requestContext: context(buildAgentContextEntries()) })) ?? ["?"])]).toEqual([]);
      expect([...((await resolve({ agentId: `${CUSTOM_AGENT_ID}-chat`, requestContext: undefined })) ?? ["?"])]).toEqual([]);
      expect([...((await resolve({ agentId: CUSTOM_AGENT_ID, requestContext: named(OTHER_TENANT) })) ?? ["?"])]).toEqual([]);
      expect([...((await setup([buildCustomAgent({ enabled: false })])({ agentId: CUSTOM_AGENT_ID, requestContext: named() })) ?? ["?"])]).toEqual([]);
    });

    it("gives the record's ceiling to a run that names it, whatever agent id the call reports", async () => {
      const resolve = setup();
      expect([...((await resolve({ agentId: CUSTOM_AGENT_ID, requestContext: named() })) ?? [])].sort()).toEqual(["core.catalog.read", "core.chat.use"]);
      expect([...((await resolve({ agentId: "", requestContext: named() })) ?? [])].sort()).toEqual(["core.catalog.read", "core.chat.use"]);
    });
  });

  describe("scoped knowledge search", () => {
    const seen: unknown[] = [];
    const search: CoreToolDefinition = {
      ...tool("knowledge.searchKnowledge", "core.knowledge.read"),
      execute: (input: unknown) => {
        seen.push(input);
        return Promise.resolve({ ok: true });
      },
    };
    const ctx = (projectId?: string) => ({ agent: { projectId } }) as unknown as CoreToolContext;

    it("forces the organization namespace, whatever the model asked for", async () => {
      await scopedKnowledgeTool(search, "organization").execute({ query: "x", namespaces: ["catalog", "project:p1"] }, ctx("p1"));
      expect(seen.at(-1)).toEqual({ query: "x", namespaces: ["tenant"] });
    });

    it("adds the active project for the project scope", async () => {
      await scopedKnowledgeTool(search, "project").execute({ query: "x" }, ctx("p1"));
      expect(seen.at(-1)).toEqual({ query: "x", namespaces: ["tenant", "project:p1"] });
      await scopedKnowledgeTool(search, "project").execute({ query: "x" }, ctx());
      expect(seen.at(-1)).toEqual({ query: "x", namespaces: ["tenant"] });
    });

    it("leaves the tool unchanged for the all scope", () => {
      expect(scopedKnowledgeTool(search, "all")).toBe(search);
    });
  });
});
