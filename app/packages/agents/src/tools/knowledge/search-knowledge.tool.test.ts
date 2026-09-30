import type { Citation } from "@core/contracts";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { createFakeEmbeddingModel } from "../../models/fake/fake-embedding-model.ts";
import type { KnowledgePort } from "../../runtime/runtime-ports.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort } from "../../testing/fake-ports.ts";
import { createAiCatalogReader } from "../catalog/ai-catalog-reader.ts";
import { FIXTURE_AI_CATALOG } from "../catalog/catalog-fixture.ts";
import { runCoreTool } from "../core-tool-pipeline.ts";
import type { ToolCallInfo } from "../define-core-tool.ts";
import { CoreToolError } from "../tool-errors.ts";
import { createSearchKnowledgeTool, effectiveNamespaces } from "./search-knowledge.tool.ts";

const DOC = "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f";
const citation = (chunk: number, score: number, title: string | null = "Guide"): Citation =>
  ({ citationId: `kb:${DOC}#${chunk}`, documentId: DOC, title, sourceUrl: null, snippet: `passage ${chunk}`, score }) as Citation;

type SearchInput = Parameters<KnowledgePort["searchChunks"]>[0];

const setup = (answers: { tenant?: Citation[]; catalog?: Citation[] } = {}) => {
  const calls: SearchInput[] = [];
  const knowledge: KnowledgePort = {
    searchChunks: (input) => {
      calls.push(input);
      return Promise.resolve(input.namespaces.includes("catalog") ? (answers.catalog ?? []) : (answers.tenant ?? []));
    },
    registerDocument: () => Promise.reject(new Error("unused")),
    replaceChunks: () => Promise.reject(new Error("unused")),
  };
  const permissions = ["core.chat.use", "core.knowledge.read", "core.catalog.read", "example.note.read"];
  const deps = {
    access: createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions }] }),
    audit: createFakeAuditPort(),
    approvals: createFakeApprovalPort(),
  };
  const tool = createSearchKnowledgeTool({ knowledge, embedding: () => createFakeEmbeddingModel(), catalog: createAiCatalogReader(FIXTURE_AI_CATALOG) });
  const call = (overrides: Parameters<typeof buildAgentContextEntries>[0] = {}): ToolCallInfo => ({
    requestContext: new RequestContext<unknown>(buildAgentContextEntries({ permissions, ...overrides })),
    agentId: "knowledge",
    toolCallId: "call_1",
  });
  return { calls, deps, tool, call };
};

describe("knowledge.searchKnowledge", () => {
  it("searches the context tenant, with only the allowed namespaces even if the model asks for others", async () => {
    const { calls, deps, tool, call } = setup({ tenant: [citation(0, 0.9)] });
    const result = await runCoreTool(tool, deps, { query: "who approves members", namespaces: ["project:someone-else", "module:other"] }, call({ projectId: "p1" }));
    expect(result).toEqual({ results: [citation(0, 0.9)] });
    expect(calls.map((input) => ({ tenantId: input.tenantId, namespaces: input.namespaces }))).toEqual([
      { tenantId: TEST_TENANT, namespaces: ["tenant", "project:p1"] },
      { tenantId: TEST_TENANT, namespaces: ["catalog"] },
    ]);
    expect(calls[0]?.embedding).toHaveLength(1536);
  });

  it("rejects a tenant smuggled into the input and never searches", async () => {
    const { calls, deps, tool, call } = setup();
    await expect(runCoreTool(tool, deps, { query: "x", tenantId: "other" }, call())).rejects.toBeInstanceOf(CoreToolError);
    expect(calls).toEqual([]);
  });

  it("leaves the catalog out without core.catalog.read and hides contracts the caller may not see", async () => {
    const withoutCatalog = setup();
    await runCoreTool(withoutCatalog.tool, withoutCatalog.deps, { query: "x", namespaces: ["catalog"] }, withoutCatalog.call({ permissions: ["core.chat.use", "core.knowledge.read"] }));
    expect(withoutCatalog.calls.map((input) => input.namespaces)).toEqual([["tenant"]]);
    const hidden = setup({ catalog: [citation(1, 0.8, "example.Note"), citation(2, 0.7, "secret.Unknown")] });
    const result = await runCoreTool(hidden.tool, hidden.deps, { query: "notes", namespaces: ["catalog"] }, hidden.call());
    expect((result as { results: Citation[] }).results.map((hit) => hit.title)).toEqual(["example.Note"]);
  });

  it("merges by score and caps at topK", async () => {
    const { deps, tool, call } = setup({ tenant: [citation(0, 0.5), citation(1, 0.9)], catalog: [citation(2, 0.7, "example.Note")] });
    const result = (await runCoreTool(tool, deps, { query: "x", topK: 2 }, call())) as { results: Citation[] };
    expect(result.results.map((hit) => hit.score)).toEqual([0.9, 0.7]);
  });

  it("needs core.knowledge.read", async () => {
    const { calls, deps, tool, call } = setup();
    await expect(runCoreTool(tool, deps, { query: "x" }, call({ permissions: ["core.chat.use"] }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toEqual([]);
  });
});

describe("effectiveNamespaces", () => {
  it("intersects the request with the allowed set and falls back to every allowed namespace", () => {
    expect(effectiveNamespaces(["catalog", "tenant", "tenant"], ["tenant", "catalog"])).toEqual(["catalog", "tenant"]);
    expect(effectiveNamespaces(["project:x"], ["tenant"])).toEqual(["tenant"]);
    expect(effectiveNamespaces(undefined, ["tenant", "catalog"])).toEqual(["tenant", "catalog"]);
  });
});
