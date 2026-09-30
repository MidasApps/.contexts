import { describe, expect, it } from "vitest";
import { createAiCatalogReader, InvalidAiCatalogError, REDACTED } from "./ai-catalog-reader.ts";
import { loadBundledAiCatalog } from "./ai-catalog-source.ts";
import { FIXTURE_AI_CATALOG } from "./catalog-fixture.ts";

const reader = createAiCatalogReader(FIXTURE_AI_CATALOG);
const MEMBER = new Set(["example.note.read", "example.note.create"]);

describe("createAiCatalogReader.list", () => {
  it("hides contracts whose permission the principal lacks and keeps those without one", () => {
    const ids = reader.list({ permissions: MEMBER, limit: 50 }).entities.map((entity) => entity.id);
    expect(ids).toEqual(["example.CreateNoteCommand", "example.Note", "tenancy.Organization"]);
  });

  it("filters by kind and by a case-insensitive query over id, name and description", () => {
    expect(reader.list({ permissions: MEMBER, kind: "command", limit: 50 }).entities.map((entity) => entity.id)).toEqual(["example.CreateNoteCommand"]);
    expect(reader.list({ permissions: MEMBER, query: "SHORT note", limit: 50 }).entities.map((entity) => entity.id)).toEqual(["example.Note"]);
  });

  it("caps the page and says it was truncated", () => {
    expect(reader.list({ permissions: MEMBER, limit: 1 })).toMatchObject({ total: 3, truncated: true, entities: [{ id: "example.CreateNoteCommand" }] });
  });
});

describe("createAiCatalogReader.describe", () => {
  it("describes personal fields but redacts their examples, and never lists sensitive fields", () => {
    const note = reader.describe({ id: "example.Note", permissions: MEMBER });
    expect(note?.fields.map((field) => field.name)).toEqual(["id", "text", "authorId"]);
    expect(note?.fields.find((field) => field.name === "text")).toEqual({ name: "text", description: "Note body.", pii: "personal", required: true });
    expect(note?.fields.find((field) => field.name === "authorId")?.ui).toEqual({ widget: "hidden" });
    expect(note?.examples).toEqual([{ id: "Xk2mQ9vLr3TnB7pWc1aZ", text: REDACTED, authorId: REDACTED }]);
    expect(JSON.stringify(note)).not.toContain("secretToken");
    expect(note?.relations).toEqual([{ field: "tenantId", target: "tenancy.Organization", type: "belongs-to" }]);
  });

  it("returns undefined for a hidden or unknown contract", () => {
    expect(reader.describe({ id: "billing.Invoice", permissions: MEMBER })).toBeUndefined();
    expect(reader.describe({ id: "example.Missing", permissions: MEMBER })).toBeUndefined();
    expect(reader.describe({ id: "billing.Invoice", permissions: new Set(["billing.invoice.read"]) })?.id).toBe("billing.Invoice");
  });

  it("refuses a catalog that does not match the expected shape", () => {
    expect(() => createAiCatalogReader({ catalogVersion: 1, contracts: [{ id: "x" }] })).toThrow(InvalidAiCatalogError);
  });
});

describe("bundled catalog", () => {
  it("parses the generated docs/catalog/catalog.ai.json", () => {
    const bundled = createAiCatalogReader(loadBundledAiCatalog());
    expect(bundled.describe({ id: "usage.LlmCall", permissions: new Set(["core.usage.read"]) })?.kind).toBe("view");
  });
});
