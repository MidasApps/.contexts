import { PLATFORM_TENANT_ID } from "@core/contracts";
import { RequestContext } from "@mastra/core/request-context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAgentContextEntries } from "../../testing/agent-context-fixture.ts";
import { loadBundledAiCatalog } from "../../tools/catalog/ai-catalog-source.ts";
import {
  type CatalogReindexResult,
  createCatalogReindexWorkflow,
  renderContractDocument,
} from "./catalog-reindex.workflow.ts";
import { makeKnowledgePostgresWorld } from "./knowledge-postgres.fixture.ts";

const world = makeKnowledgePostgresWorld();
const catalog = loadBundledAiCatalog() as { contracts: { id: string; fields: { name: string; pii: string }[] }[] };
const workflow = createCatalogReindexWorkflow({
  knowledge: world.knowledge,
  embedding: world.embedding,
  embeddingModelId: world.embeddingModelId,
  aiCatalog: catalog,
});

const run = async (requestContext = new RequestContext<unknown>()): Promise<CatalogReindexResult> => {
  const result = await (await workflow.createRun()).start({ inputData: {}, requestContext });
  if (result.status !== "success") throw new Error(`workflow ${result.status}`);
  return result.result;
};

beforeAll(async () => {
  await world.deleteTenant(PLATFORM_TENANT_ID, "catalog");
});

afterAll(async () => {
  await world.sql.end();
});

describe("catalog-reindex workflow (Postgres, fake embeddings)", () => {
  it("indexes one _platform document per AI-catalog contract in namespace catalog, then skips unchanged ones", async () => {
    const first = await run();
    expect(first).toEqual({
      status: "done",
      total: catalog.contracts.length,
      indexed: catalog.contracts.length,
      unchanged: 0,
      code: null,
    });
    const { documents } = await world.rowsOf(PLATFORM_TENANT_ID);
    const catalogDocs = documents.filter((document) => document.source === "catalog");
    expect(catalogDocs.map((document) => document.source_ref).sort()).toEqual(
      catalog.contracts.map((contract) => contract.id).sort(),
    );
    expect(
      catalogDocs.every(
        (document) =>
          document.namespace === "catalog" && document.status === "ready" && document.title === document.source_ref,
      ),
    ).toBe(true);
    expect(await run()).toEqual({
      status: "done",
      total: catalog.contracts.length,
      indexed: 0,
      unchanged: catalog.contracts.length,
      code: null,
    });
    // Two full runs over every AI-catalog contract (about 100 documents): above the default 5 s on a busy machine.
  }, 60_000);

  it("is readable by any tenant in the catalog namespace", async () => {
    const [embedding] = (await world.embedding().doEmbed({ values: ["uploaded file validated by content"] }))
      .embeddings;
    const hits = await world.knowledge.searchChunks({
      tenantId: "kbAnyTenant000000001",
      namespaces: ["catalog"],
      embedding: embedding ?? [],
      topK: 3,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((hit) => hit.title)).toContain("files.StoredFile");
  });

  it("refuses a run that carries a caller principal (HTTP), since it writes platform rows", async () => {
    const result = await run(new RequestContext<unknown>(buildAgentContextEntries()));
    expect(result).toMatchObject({ status: "failed", code: "PLATFORM_ONLY" });
  });

  it("never renders sensitive fields or examples", () => {
    for (const contract of catalog.contracts) {
      const text = renderContractDocument(contract as never);
      for (const field of contract.fields.filter((candidate) => candidate.pii === "sensitive"))
        expect(text).not.toContain(`\`${field.name}\``);
      // No examples section (a contract may be named `ExampleSettings`, so the word alone proves nothing).
      expect(text).not.toMatch(/^#+ Examples?(?: |$)/m);
    }
  });
});
