import { describe, expect, it } from "vitest";
import { CHUNKS_V1_DIMENSIONS } from "../../adapters/driven/drizzle-schema.ts";
import type { ChunkMatch, KnowledgeRepository } from "../ports/knowledge-repository.ts";
import { makeDeleteDocument } from "./delete-document.ts";
import { makeGetDocument } from "./get-document.ts";
import { makeListDocuments } from "./list-documents.ts";
import { makeRegisterDocument } from "./register-document.ts";
import { makeReplaceDocumentChunks } from "./replace-document-chunks.ts";
import { MIN_CITATION_SCORE, makeSearchChunks } from "./search-chunks.ts";

const DOC_ID = "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f";
const vector = (): number[] => Array.from({ length: CHUNKS_V1_DIMENSIONS }, (_, index) => (index === 0 ? 1 : 0));

/** Records calls; answers with the given matches. Validation must stop bad input before any call. */
const fakeRepository = (matches: ChunkMatch[] = []) => {
  const calls: string[] = [];
  const repository: KnowledgeRepository = {
    upsertDocument: () => {
      calls.push("upsertDocument");
      return Promise.reject(new Error("not needed"));
    },
    replaceChunks: () => {
      calls.push("replaceChunks");
      return Promise.resolve(false);
    },
    searchChunks: (input) => {
      calls.push(`searchChunks:${input.embeddingModel}`);
      return Promise.resolve(matches);
    },
    deleteDocument: () => {
      calls.push("deleteDocument");
      return Promise.resolve(false);
    },
    getDocument: () => {
      calls.push("getDocument");
      return Promise.resolve(null);
    },
    listDocuments: () => {
      calls.push("listDocuments");
      return Promise.resolve({ documents: [], nextCursor: null });
    },
  };
  return { repository, calls };
};

const match = (chunkIndex: number, distance: number): ChunkMatch => ({
  documentId: DOC_ID,
  chunkIndex,
  text: `chunk ${chunkIndex}`,
  distance,
  title: null,
  sourceUrl: null,
  namespace: "tenant",
});

describe("registerDocument", () => {
  it("keeps platform namespaces for _platform and tenant namespaces for tenants", async () => {
    const { repository, calls } = fakeRepository();
    const register = makeRegisterDocument({ repository });
    const base = { source: "upload", sourceRef: "file-1", contentHash: "a".repeat(64) } as const;
    for (const input of [
      { ...base, tenantId: "TenantA", namespace: "catalog" },
      { ...base, tenantId: "TenantA", namespace: "module:example" },
      { ...base, tenantId: "_platform", namespace: "tenant" },
      { ...base, tenantId: "_platform", namespace: "project:p1" },
    ]) {
      expect(await register(input)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED", details: [{ field: "namespace" }] },
      });
    }
    expect(calls).toEqual([]);
  });

  it("refuses a non-https source URL and a malformed content hash", async () => {
    const register = makeRegisterDocument(fakeRepository());
    const result = await register({
      tenantId: "TenantA",
      namespace: "tenant",
      source: "url",
      sourceRef: "u",
      contentHash: "nope",
      sourceUrl: "http://x.test/a",
    });
    expect(result.ok ? [] : result.error.details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(["contentHash", "sourceUrl"]),
    );
  });
});

describe("replaceDocumentChunks", () => {
  it("requires dense chunk indexes and 1536-dimension finite vectors", async () => {
    const { repository, calls } = fakeRepository();
    const replace = makeReplaceDocumentChunks({ repository });
    const base = { tenantId: "TenantA", documentId: DOC_ID, embeddingModel: "m", embeddingVersion: "v1" };
    const chunk = (chunkIndex: number, embedding = vector()) => ({ chunkIndex, text: "t", tokenCount: 1, embedding });
    expect((await replace({ ...base, chunks: [chunk(0), chunk(2)] })).ok).toBe(false);
    expect((await replace({ ...base, chunks: [chunk(0, [1, 2, 3])] })).ok).toBe(false);
    expect((await replace({ ...base, chunks: [chunk(0, [...vector().slice(1), Number.NaN])] })).ok).toBe(false);
    expect(calls).toEqual([]);
    expect(await replace({ ...base, chunks: [chunk(1), chunk(0)] })).toEqual({
      ok: false,
      error: { code: "DOCUMENT_NOT_FOUND" },
    });
  });
});

describe("searchChunks", () => {
  it("maps matches to citations, rounds scores and drops those below the minimum", async () => {
    const { repository, calls } = fakeRepository([match(0, 0.123456), match(1, 1 - MIN_CITATION_SCORE + 0.01)]);
    const search = makeSearchChunks({ repository, embeddingModel: "google/gemini-embedding-2" });
    const result = await search({ tenantId: "TenantA", namespaces: ["tenant"], embedding: vector() });
    expect(result).toEqual({
      ok: true,
      data: [
        {
          citationId: `kb:${DOC_ID}#0`,
          documentId: DOC_ID,
          title: null,
          sourceUrl: null,
          snippet: "chunk 0",
          score: 0.8765,
        },
      ],
    });
    expect(calls).toEqual(["searchChunks:google/gemini-embedding-2"]);
  });

  it("bounds topK and namespaces", async () => {
    const search = makeSearchChunks({ ...fakeRepository(), embeddingModel: "m" });
    expect((await search({ tenantId: "TenantA", namespaces: ["tenant"], embedding: vector(), topK: 21 })).ok).toBe(
      false,
    );
    expect((await search({ tenantId: "TenantA", namespaces: [], embedding: vector() })).ok).toBe(false);
    expect((await search({ tenantId: "TenantA", namespaces: ["../etc"], embedding: vector() })).ok).toBe(false);
  });
});

describe("deleteDocument and listDocuments", () => {
  it("validate ids and page limits before touching the repository", async () => {
    const { repository, calls } = fakeRepository();
    expect((await makeDeleteDocument({ repository })({ tenantId: "TenantA", documentId: "not-a-uuid" })).ok).toBe(
      false,
    );
    expect((await makeListDocuments({ repository })({ tenantId: "TenantA", limit: 101 })).ok).toBe(false);
    expect(calls).toEqual([]);
    expect(await makeDeleteDocument({ repository })({ tenantId: "TenantA", documentId: DOC_ID })).toEqual({
      ok: false,
      error: { code: "DOCUMENT_NOT_FOUND" },
    });
    expect(await makeListDocuments({ repository })({ tenantId: "TenantA" })).toEqual({
      ok: true,
      data: { documents: [], nextCursor: null },
    });
    expect((await makeGetDocument({ repository })({ tenantId: "TenantA", documentId: "nope" })).ok).toBe(false);
    expect(await makeGetDocument({ repository })({ tenantId: "TenantA", documentId: DOC_ID })).toEqual({
      ok: false,
      error: { code: "DOCUMENT_NOT_FOUND" },
    });
  });
});
