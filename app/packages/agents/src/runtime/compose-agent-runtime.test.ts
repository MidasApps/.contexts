import { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import { InMemoryStore } from "@mastra/core/storage";
import type { MastraVector } from "@mastra/core/vector";
import { ConnectorSchema } from "@core/contracts";
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
  it("returns the entry agents, the subagents, the auth provider, both middlewares and the core tools", () => {
    const runtime = compose();
    expect(Object.keys(runtime.agents)).toEqual([PING_AGENT_ID, "assistant", "assistant-chat"]);
    expect(runtime.chat.chatAgents).toEqual({ assistant: "assistant-chat" });
    expect(Object.keys(runtime.subagents)).toEqual(["knowledge", "data", "action", "web"]);
    expect(runtime.auth).toBeInstanceOf(FirebaseMastraAuth);
    expect(runtime.middleware.map((entry) => entry.path)).toEqual(["/api/*", "/api/*", "/chat/*"]);
    expect(runtime.tools.ids()).toEqual([
      "catalog.listEntities",
      "catalog.describeEntity",
      "catalog.renderForm",
      "sql.querySemanticSql",
      "knowledge.searchKnowledge",
      "web.search",
      "web.scrape",
      "command.tenancy.CreateProjectInput",
    ]);
    expect(Object.keys(runtime.mcpServers)).toEqual(["core"]);
    expect(runtime).toMatchObject({ vectors: {} });
    expect(Object.keys(runtime.scorers)).toEqual(["tool-routing", "citations-grounded", "tenant-leak", "format-compliance"]);
    expect(runtime.apiRoutes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "POST /voice/transcriptions",
      "POST /voice/speech",
      "POST /chat/:agentId",
      "GET /chat/:agentId/runs/:runId/observe",
      "POST /chat/runs/:runId/abort",
      "POST /workflow-approvals/:approvalRequestId/settle",
    ]);
    expect(runtime.voice?.capabilities).toEqual({ transcription: true, speech: true, realtime: false });
    expect(Object.keys(runtime.workflows).sort()).toEqual(["approval-demo", "catalog-reindex", "knowledge-ingest"]);
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

  it("puts the entry guardrail profile on every entry agent and the delegated one on subagents", async () => {
    const runtime = compose();
    for (const agent of Object.values(runtime.agents)) {
      const input = (await agent.listConfiguredInputProcessors()).map((processor) => processor.id);
      const output = (await agent.listConfiguredOutputProcessors()).map((processor) => processor.id);
      expect(input).toEqual(expect.arrayContaining([TENANT_BUDGET_GUARD_ID, "prompt-injection-detector", "moderation", "token-limiter"]));
      expect(output).toEqual(expect.arrayContaining(["regex-filter"]));
    }
    for (const agent of Object.values(runtime.subagents)) {
      const input = (await agent.listConfiguredInputProcessors()).map((processor) => processor.id);
      expect(input).toEqual(expect.arrayContaining([TENANT_BUDGET_GUARD_ID, "token-limiter"]));
      expect(input).not.toContain("prompt-injection-detector");
    }
  });

  it("attaches the tenant-scoped memory to the supervisor only", () => {
    const runtime = composeAgentRuntime({
      env: ENV,
      ports: createFakeRuntimePorts(),
      modules: [],
      storage: new InMemoryStore(),
      vector: { id: "stub-vector" } as unknown as MastraVector,
      serviceName: "mastra",
      aiCatalog: FIXTURE_AI_CATALOG,
    });
    expect(runtime.agents.assistant?.hasOwnMemory()).toBe(true);
    expect(Object.values(runtime.subagents).some((agent) => agent.hasOwnMemory())).toBe(false);
  });

  it("keeps module agents behind the supervisor unless they declare the entry role", () => {
    const helper = { id: "sample-helper", ceiling: [], create: () => compose().agents[PING_AGENT_ID] as never };
    const runtime = compose([defineAgentModule({ id: "sample", agents: [helper] })]);
    expect(Object.keys(runtime.subagents)).toContain("sample-helper");
    expect(Object.keys(runtime.agents)).not.toContain("sample-helper");
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

describe("connector tools in the composed agents", () => {
  it("adds the tenant's connector tools per run to the supervisor and the action agent", async () => {
    const connector = ConnectorSchema.parse({
      id: "Cn4sK2lPq0WnR5tYu3bV",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      name: "issues-api",
      type: "openapi",
      status: "active",
      secretRef: null,
      toolPolicy: { allow: ["listIssues", "createIssue"], readOnly: ["listIssues"] },
      config: { specUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"], auth: "none", apiKeyHeader: null },
      createdBy: "uA1b2C3d4E5f6G7h8I9j",
      createdAt: "2026-09-30T12:00:00.000Z",
      updatedAt: "2026-09-30T12:00:00.000Z",
    });
    const connectorTool = (id: string, kind: "read" | "mutation") => ({ ...echoTool(id), kind, permission: "core.chat.use" });
    const runtime = composeAgentRuntime({
      env: ENV,
      ports: createFakeRuntimePorts({ connectors: { listActive: () => Promise.resolve([connector]) } }),
      modules: [],
      storage: new InMemoryStore(),
      serviceName: "mastra",
      aiCatalog: FIXTURE_AI_CATALOG,
      connectorLoaders: {
        openApiTools: () => Promise.resolve([connectorTool("api.issues-api.listIssues", "read"), connectorTool("api.issues-api.createIssue", "mutation")]),
        mcpToolset: () => Promise.reject(new Error("unused")),
        postgresTools: () => [],
      },
    });
    const requestContext = new RequestContext<unknown>(buildAgentContextEntries());
    expect(Object.keys(await runtime.agents.assistant?.listTools({ requestContext }) ?? {})).toEqual(["api.issues-api.listIssues"]);
    const actionTools = Object.keys((await runtime.subagents.action?.listTools({ requestContext })) ?? {});
    expect(actionTools).toEqual(expect.arrayContaining(["command.tenancy.CreateProjectInput", "api.issues-api.createIssue", "api.issues-api.listIssues"]));
  });
});
