import { RequestContext } from "@mastra/core/request-context";
import { InMemoryStore } from "@mastra/core/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractCitationIds } from "../knowledge/citation.ts";
import { indexDocumentText } from "../knowledge/index-document.ts";
import { makeKnowledgePostgresWorld } from "../knowledge/workflows/knowledge-postgres.fixture.ts";
import { createModelProvider } from "../models/model-factory.ts";
import { composeAgentRuntime } from "../runtime/compose-agent-runtime.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeRuntimePorts } from "../testing/fake-ports.ts";
import { KNOWLEDGE_AGENT_ID } from "./knowledge-agent.ts";

// The knowledge agent end to end on the fake model: directive → searchKnowledge over the
// real knowledge base (Postgres, row level security, fake embeddings) → cited answer.
const world = makeKnowledgePostgresWorld();
const PERMISSIONS = ["core.chat.use", "core.knowledge.read"];
const ENV = { APP_ENV: "local", AI_MODE: "fake", AI_MODEL_EMBEDDING: "google/gemini-embedding-2" } as never;

const models = createModelProvider({
  ...(ENV as object),
  AI_MODEL_CHAT: "google/gemini-3.5-flash",
  AI_MODEL_FAST: "google/gemini-3.5-flash-lite",
} as never);
const runtime = composeAgentRuntime({
  env: ENV,
  ports: createFakeRuntimePorts({
    access: createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: PERMISSIONS }] }),
    knowledge: world.knowledge,
  }),
  modules: [],
  storage: new InMemoryStore(),
  serviceName: "test",
  models,
});

const context = () => new RequestContext<unknown>(buildAgentContextEntries({ permissions: PERMISSIONS }));
const directive = (query: string) =>
  `[[fake:tool-call {"toolName":"knowledge.searchKnowledge","input":{"query":"${query}"}}]]`;

beforeAll(async () => {
  await world.deleteTenant(TEST_TENANT);
  await indexDocumentText(world, {
    document: {
      tenantId: TEST_TENANT,
      namespace: "tenant",
      source: "upload",
      sourceRef: "agent-guide",
      title: "Guide",
      sourceUrl: null,
      mimeType: "text/markdown",
      metadata: {},
      createdBy: TEST_UID,
    },
    text: "# Invitations\n\nNew members get access after an owner approves the invitation.",
    format: "markdown",
  });
});

afterAll(async () => {
  await world.deleteTenant(TEST_TENANT);
  await world.sql.end();
});

describe("knowledge agent (fake model, Postgres knowledge base)", () => {
  it("searches the knowledge base and answers with kb citations from the retrieved set", async () => {
    const agent = runtime.subagents[KNOWLEDGE_AGENT_ID];
    const result = await agent?.generate(directive("who approves the invitation of new members"), {
      requestContext: context(),
    });
    const retrieved = extractCitationIds(JSON.stringify(result?.toolResults ?? []));
    expect(retrieved.length).toBeGreaterThan(0);
    const cited = [...(result?.text ?? "").matchAll(/\[(kb:[^\]]+)\]/g)].map((match) => match[1]);
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(retrieved).toContain(id);
  });

  it("never returns another tenant's passages", async () => {
    const agent = runtime.subagents[KNOWLEDGE_AGENT_ID];
    const other = new RequestContext<unknown>(
      buildAgentContextEntries({ tenantId: "kbOtherTenant0000001", permissions: PERMISSIONS }),
    );
    const result = await agent?.generate(directive("owner approves the invitation"), { requestContext: other });
    expect(extractCitationIds(JSON.stringify(result?.toolResults ?? []))).toEqual([]);
  });
});
