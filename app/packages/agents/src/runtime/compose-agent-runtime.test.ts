import { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PING_AGENT_ID } from "../agents/ping-agent.ts";
import { FirebaseMastraAuth } from "../auth/firebase-mastra-auth.ts";
import { TENANT_BUDGET_GUARD_ID } from "../processors/tenant-budget-guard.ts";
import { buildAgentContextEntries } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeRuntimePorts, createFakeUsagePort } from "../testing/fake-ports.ts";
import { FIXTURE_AI_CATALOG } from "../tools/catalog/catalog-fixture.ts";
import { defineCoreTool } from "../tools/define-core-tool.ts";
import { DuplicateToolError } from "../tools/tool-registry.ts";
import { type AgentModule, AgentModuleError, defineAgentModule } from "./agent-module.ts";
import { composeAgentRuntime } from "./compose-agent-runtime.ts";

const ENV = {
  APP_ENV: "local",
  AI_MODE: "fake",
  AI_MODEL_CHAT: "google/gemini-3.5-flash",
  AI_MODEL_FAST: "google/gemini-3.5-flash-lite",
  AI_MODEL_REASONING: "google/gemini-3.5-flash",
  AI_MODEL_JUDGE: "google/gemini-3.5-flash",
  AI_MODEL_EMBEDDING: "google/gemini-embedding-2",
  AI_MODEL_TRANSCRIPTION: "openai/gpt-4o-mini-transcribe",
  AI_MODEL_SPEECH: "openai/gpt-4o-mini-tts",
  AI_MODEL_ANALYSIS: "google/gemini-3.5-flash",
  GOOGLE_AI_BACKEND: "ai-studio",
} as const;

const compose = (modules: readonly AgentModule[] = [], permissions: readonly string[] = ["core.chat.use", "core.catalog.read"]) => {
  const access = createFakeAccessPort({ memberships: [{ tenantId: "Jd8sK2lPq0WnR5tYu3bV", uid: "member-uid", permissions }] });
  return composeAgentRuntime({
    env: ENV,
    ports: createFakeRuntimePorts({ access }),
    modules,
    storage: new InMemoryStore(),
    serviceName: "mastra",
    aiCatalog: FIXTURE_AI_CATALOG,
  });
};

const echoTool = (id: string) =>
  defineCoreTool({
    id,
    description: "Echoes a word back, for composition tests only.",
    kind: "read",
    permission: "sample.echo.read",
    inputSchema: z.strictObject({ word: z.string().describe("Word to echo.") }),
    outputSchema: z.strictObject({ word: z.string() }),
    execute: (input) => Promise.resolve({ word: input.word }),
  });

describe("composeAgentRuntime", () => {
  it("returns the ping agent, the auth provider, both middlewares and the core tools", () => {
    const runtime = compose();
    expect(Object.keys(runtime.agents)).toEqual([PING_AGENT_ID, "knowledge"]);
    expect(runtime.auth).toBeInstanceOf(FirebaseMastraAuth);
    expect(runtime.middleware.map((entry) => entry.path)).toEqual(["/api/*", "/api/*"]);
    expect(runtime.tools.ids()).toEqual(["catalog.listEntities", "catalog.describeEntity", "sql.querySemanticSql", "knowledge.searchKnowledge"]);
    expect(runtime).toMatchObject({ scorers: {}, mcpServers: {}, vectors: {}, apiRoutes: [] });
    expect(Object.keys(runtime.workflows).sort()).toEqual(["catalog-reindex", "knowledge-ingest"]);
  });

  it("registers module tools and agents", () => {
    const module = defineAgentModule({ id: "sample", tools: [echoTool("sample.echo")] });
    expect(compose([module]).tools.has("sample.echo")).toBe(true);
  });

  it("fails at boot on a duplicated tool or agent", () => {
    const first = defineAgentModule({ id: "sample", tools: [echoTool("sample.echo")] });
    const second = defineAgentModule({ id: "sample", tools: [echoTool("sample.echo")] });
    expect(() => compose([first, second])).toThrow(DuplicateToolError);
    const agent = { id: "sample-bot", ceiling: [], create: () => compose().agents[PING_AGENT_ID] as never };
    const dup = defineAgentModule({ id: "sample", agents: [agent] });
    expect(() => compose([dup, dup])).toThrow(AgentModuleError);
  });

  it("runs the ping agent on the fake model with the typed context", async () => {
    const agent = compose().agents[PING_AGENT_ID];
    const result = await agent?.generate("ping", { requestContext: new RequestContext<unknown>(buildAgentContextEntries()) });
    expect(result?.text.length).toBeGreaterThan(0);
  });

  it("puts the entry guardrail profile on every core agent", async () => {
    for (const agent of Object.values(compose().agents)) {
      const input = (await agent.listConfiguredInputProcessors()).map((processor) => processor.id);
      const output = (await agent.listConfiguredOutputProcessors()).map((processor) => processor.id);
      expect(input).toEqual(expect.arrayContaining([TENANT_BUDGET_GUARD_ID, "prompt-injection-detector", "moderation", "token-limiter"]));
      expect(output).toEqual(expect.arrayContaining(["regex-filter"]));
    }
  });

  it("bills the agent and its guardrail detectors in the usage ledger", async () => {
    const usage = createFakeUsagePort();
    const access = createFakeAccessPort({ memberships: [{ tenantId: "Jd8sK2lPq0WnR5tYu3bV", uid: "member-uid", permissions: ["core.chat.use"] }] });
    const runtime = composeAgentRuntime({ env: ENV, ports: createFakeRuntimePorts({ access, usage }), modules: [], storage: new InMemoryStore(), serviceName: "mastra", aiCatalog: FIXTURE_AI_CATALOG });
    const mastra = new Mastra({ agents: runtime.agents, storage: runtime.storage, observability: runtime.observability });
    await mastra.getAgent(PING_AGENT_ID).generate("ping", { requestContext: new RequestContext<unknown>(buildAgentContextEntries()) });
    await vi.waitFor(() => expect(usage.calls.map((call) => call.agentId)).toEqual(expect.arrayContaining([PING_AGENT_ID, "prompt-injection-detector", "moderation"])), { timeout: 5000 });
    expect(new Set(usage.calls.map((call) => call.tenantId))).toEqual(new Set(["Jd8sK2lPq0WnR5tYu3bV"]));
  });

  it("refuses a run without the typed context before the model runs", async () => {
    const agent = compose().agents[PING_AGENT_ID];
    await expect(agent?.generate("ping", { requestContext: new RequestContext<unknown>() })).rejects.toThrow(/Request context validation failed/);
  });

  it("caps tool calls at the agent ceiling and the context permissions", async () => {
    const agent = compose().agents[PING_AGENT_ID];
    const directive = '[[fake:tool-call {"toolName":"catalog.listEntities","input":{"limit":5}}]]';
    const allowed = await agent?.generate(directive, {
      requestContext: new RequestContext<unknown>(buildAgentContextEntries({ permissions: ["core.chat.use", "core.catalog.read"] })),
    });
    expect(JSON.stringify(allowed?.toolResults)).toContain("tenancy.Organization");
    const denied = await agent?.generate(directive, { requestContext: new RequestContext<unknown>(buildAgentContextEntries({ permissions: ["core.chat.use"] })) });
    // A denied call reaches the model as an error result, never as data.
    const deniedContent = JSON.stringify(denied?.steps.map((step) => step.content));
    expect(deniedContent).toContain("not allowed");
    expect(deniedContent).not.toContain("tenancy.Organization");
  });
});

describe("defineAgentModule", () => {
  it("rejects reserved ids, unprefixed capabilities and unknown manifest refs", () => {
    expect(() => defineAgentModule({ id: "core" })).toThrow(AgentModuleError);
    expect(() => defineAgentModule({ id: "sample", tools: [echoTool("other.echo")] })).toThrow(/UNPREFIXED_CAPABILITY/);
    expect(() => defineAgentModule({ id: "sample", manifest: { id: "sample", tools: [{ id: "sample.missing" }] } })).toThrow(/UNKNOWN_CAPABILITY_REF/);
    expect(() => defineAgentModule({ id: "sample", manifest: { id: "sample" }, tools: [echoTool("sample.echo")] })).toThrow(/MANIFEST_MISMATCH/);
    expect(defineAgentModule({ id: "sample", manifest: { id: "sample", tools: [{ id: "sample.echo" }] }, tools: [echoTool("sample.echo")] }).id).toBe("sample");
  });
});
