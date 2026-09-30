import { describe, expect, expectTypeOf, it } from "vitest";
import type { TenantId } from "../primitives/ids.schema.ts";
import { CitationContract, CitationSchema } from "./citation.schema.ts";
import { KnowledgeDocumentContract, KnowledgeDocumentSchema, type KnowledgeDocument } from "./knowledge-document.schema.ts";
import { KnowledgeSourceContract, KnowledgeSourceSchema } from "./knowledge-source.schema.ts";

const contracts = [KnowledgeDocumentContract, KnowledgeSourceContract, CitationContract];

describe("knowledge contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: every example parses", (_id, contract) => {
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
  });

  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: rejects an unknown key", (_id, contract) => {
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
  });

  it("brands tenant ids", () => {
    expectTypeOf<KnowledgeDocument["tenantId"]>().toEqualTypeOf<TenantId>();
  });
});

describe("KnowledgeDocumentSchema", () => {
  const [example] = KnowledgeDocumentContract.meta.examples as [Record<string, unknown>];

  it.each(["tenant", "catalog", "project:Pq8sK2lPq0WnR5tYu3bV", "module:example"])("accepts namespace %s", (namespace) => {
    expect(KnowledgeDocumentSchema.safeParse({ ...example, namespace }).success).toBe(true);
  });

  it.each(["", "global", "project:", "module:Bad Name"])("rejects namespace %j", (namespace) => {
    expect(KnowledgeDocumentSchema.safeParse({ ...example, namespace }).success).toBe(false);
  });

  it("accepts the reserved _platform tenant", () => {
    expect(KnowledgeDocumentSchema.safeParse({ ...example, tenantId: "_platform", namespace: "catalog" }).success).toBe(true);
  });
});

describe("KnowledgeSourceSchema", () => {
  it("accepts a file source", () => {
    expect(KnowledgeSourceSchema.safeParse({ kind: "file", fileId: "Fz9sK2lPq0WnR5tYu3bV" }).success).toBe(true);
  });

  it.each(["http://example.com/a", "ftp://example.com/a", "not a url"])("rejects url %s", (url) => {
    expect(KnowledgeSourceSchema.safeParse({ kind: "url", url }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(KnowledgeSourceSchema.safeParse({ kind: "catalog" }).success).toBe(false);
  });
});

describe("CitationSchema", () => {
  const [example] = CitationContract.meta.examples as [Record<string, unknown>];

  it("requires the kb:<documentId>#<chunkIndex> format", () => {
    expect(CitationSchema.safeParse({ ...example, citationId: "doc-1" }).success).toBe(false);
  });

  it("keeps score between 0 and 1", () => {
    expect(CitationSchema.safeParse({ ...example, score: 1.2 }).success).toBe(false);
  });
});
