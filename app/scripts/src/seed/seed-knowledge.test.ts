import { createFakeEmbeddingModel, FAKE_EMBEDDING_MODEL_ID, type KnowledgeDocumentInput, type KnowledgePort } from "@core/agents";
import { describe, expect, it } from "vitest";
import { SAMPLE_KNOWLEDGE_DOCUMENTS, seedKnowledgeBase } from "./seed-knowledge.ts";

const SEED_KNOWLEDGE_TENANT_ID = "DemoOrganization0001";

const CATALOG = {
  contracts: [
    { id: "example.Note", name: "Note", context: "example", kind: "entity", description: "A note.", tenancyScope: "organization", relations: [], fields: [{ name: "id", description: "Note id.", pii: "none", required: true }] },
    { id: "files.StoredFile", name: "StoredFile", context: "files", kind: "entity", description: "A file.", tenancyScope: "organization", relations: [], fields: [] },
  ],
};

// Upserts by (tenant, source, sourceRef) and reports unchanged content, like the repository.
const inMemoryKnowledge = (): KnowledgePort & { documents: Map<string, KnowledgeDocumentInput>; replaced: string[] } => {
  const documents = new Map<string, KnowledgeDocumentInput>();
  const replaced: string[] = [];
  return {
    documents,
    replaced,
    searchChunks: () => Promise.resolve([]),
    registerDocument: (input) => {
      const key = `${input.tenantId}|${input.source}|${input.sourceRef}`;
      const unchanged = documents.get(key)?.contentHash === input.contentHash;
      documents.set(key, input);
      // Only the id is read by the indexer.
      return Promise.resolve({ document: { id: key } as unknown as Awaited<ReturnType<KnowledgePort["registerDocument"]>>["document"], unchanged });
    },
    replaceChunks: (input) => {
      replaced.push(input.documentId);
      return Promise.resolve({ chunkCount: input.chunks.length });
    },
  };
};

describe("seedKnowledgeBase", () => {
  it("indexes the catalog as platform documents and the samples for the demo tenant, then finds everything unchanged", async () => {
    const knowledge = inMemoryKnowledge();
    const deps = { knowledge, embedding: () => createFakeEmbeddingModel(), embeddingModelId: FAKE_EMBEDDING_MODEL_ID, aiCatalog: CATALOG };
    expect(await seedKnowledgeBase(deps, SEED_KNOWLEDGE_TENANT_ID)).toBe(`catalog 2 contracts (2 indexed, 0 unchanged); samples for ${SEED_KNOWLEDGE_TENANT_ID}: 2 indexed, 0 unchanged`);
    expect([...knowledge.documents.values()].map((document) => `${document.tenantId}/${document.namespace}/${document.sourceRef}`)).toEqual([
      "_platform/catalog/example.Note",
      "_platform/catalog/files.StoredFile",
      ...SAMPLE_KNOWLEDGE_DOCUMENTS.map((sample) => `${SEED_KNOWLEDGE_TENANT_ID}/tenant/${sample.sourceRef}`),
    ]);
    expect(knowledge.replaced).toHaveLength(4);
    expect(await seedKnowledgeBase(deps, SEED_KNOWLEDGE_TENANT_ID)).toBe(`catalog 2 contracts (0 indexed, 2 unchanged); samples for ${SEED_KNOWLEDGE_TENANT_ID}: 0 indexed, 2 unchanged`);
    expect(knowledge.replaced).toHaveLength(4);
  });
});
