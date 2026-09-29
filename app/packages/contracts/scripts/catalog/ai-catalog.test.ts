import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineContract } from "../../src/contracts/contract.ts";
import { createContractRegistry } from "../../src/contracts/registry.ts";
import { buildAiCatalog, REDACTED, redactExampleValue } from "./ai-catalog.ts";
import { buildCatalogEntry, type CatalogEntry } from "./catalog-entry.ts";
import { buildJsonSchemas, componentRef } from "./json-schema.ts";

const SECRET = { description: "Secret value.", pii: "sensitive" } as const;

const buildWrappedSecretsEntry = (): CatalogEntry => {
  const contract = defineContract(
    z.object({
      name: z.string().meta({ description: "Display name.", pii: "none" }),
      metaThenNullable: z.string().meta(SECRET).nullable(),
      nullableThenMeta: z.string().nullable().meta(SECRET),
      metaThenOptional: z.string().meta(SECRET).optional(),
      metaThenDefault: z.string().meta(SECRET).default("s-default"),
      defaultThenMeta: z.string().default("s-default").meta(SECRET),
    }),
    {
      id: "vault.Item",
      kind: "entity",
      description: "Item with secrets behind wrappers.",
      examples: [
        { name: "ok", metaThenNullable: "s1", nullableThenMeta: "s2", metaThenOptional: "s3", metaThenDefault: "s4", defaultThenMeta: "s5" },
      ],
      pii: "sensitive",
      tenancyScope: "organization",
      relations: [],
    },
  );
  const contracts = createContractRegistry([contract]).listContracts();
  const schemas = buildJsonSchemas(contracts);
  return buildCatalogEntry(contract, schemas.get(contract.id) ?? {});
};

const aiEntryOf = (entries: CatalogEntry[], id: string): CatalogEntry => {
  const entry = buildAiCatalog(entries).find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`missing ${id}`);
  return entry;
};

describe("buildAiCatalog", () => {
  it("drops sensitive fields behind nullable, optional and default wrappers", () => {
    const entry = aiEntryOf([buildWrappedSecretsEntry()], "vault.Item");
    expect(Object.keys(entry.jsonSchema["properties"] as object)).toEqual(["name"]);
    expect(entry.jsonSchema["required"]).toEqual(["name"]);
    expect(entry.fields.map((field) => field.name)).toEqual(["name"]);
    expect(entry.examples).toEqual([{ name: "ok" }]);
    const serialized = JSON.stringify(entry);
    for (const leaked of ["Secret value.", "s1", "s2", "s3", "s-default"]) expect(serialized).not.toContain(leaked);
  });

  it("keeps a contract whose pii is sensitive when some fields are not", () => {
    expect(buildAiCatalog([buildWrappedSecretsEntry()]).map((entry) => entry.id)).toEqual(["vault.Item"]);
  });

  it("drops a property that references a contract excluded from the AI catalog", () => {
    const hidden: CatalogEntry = {
      id: "vault.Code", context: "vault", name: "Code", kind: "view", description: "Opaque code.",
      examples: ["x"], pii: "sensitive", tenancyScope: "organization", relations: [], fields: [],
      jsonSchema: { type: "string", "x-pii": "sensitive" },
    };
    const holder: CatalogEntry = {
      id: "vault.Holder", context: "vault", name: "Holder", kind: "entity", description: "Holds a code.",
      examples: [{ label: "a", code: "x" }], pii: "none", tenancyScope: "organization", relations: [],
      fields: [
        { name: "code", description: "Code.", pii: "none", required: true },
        { name: "label", description: "Label.", pii: "none", required: true },
      ],
      jsonSchema: {
        type: "object",
        properties: { code: { $ref: componentRef("vault.Code") }, label: { type: "string", "x-pii": "none" } },
        required: ["code", "label"],
      },
    };
    const aiCatalog = buildAiCatalog([hidden, holder]);
    expect(aiCatalog.map((entry) => entry.id)).toEqual(["vault.Holder"]);
    expect(JSON.stringify(aiCatalog)).not.toContain("vault.Code");
    expect(aiCatalog[0]).toMatchObject({ examples: [{ label: "a" }], jsonSchema: { required: ["label"] } });
  });
});

describe("redactExampleValue", () => {
  const noRefs = () => undefined;

  it("drops sensitive and redacts personal values at every nesting level", () => {
    const schema = {
      type: "object",
      properties: {
        profile: {
          type: "object",
          properties: {
            ssn: { type: "string", "x-pii": "sensitive" },
            nickname: { type: "string", "x-pii": "personal" },
            city: { type: "string", "x-pii": "none" },
          },
        },
        contacts: { type: "array", items: { type: "object", properties: { phone: { type: "string", "x-pii": "personal" } } } },
        byKey: { type: "object", additionalProperties: { type: "object", properties: { ssn: { type: "string", "x-pii": "sensitive" } } } },
        maybe: { anyOf: [{ type: "string", "x-pii": "sensitive" }, { type: "null" }] },
      },
    };
    const example = {
      profile: { ssn: "111", nickname: "Ana", city: "Recife" },
      contacts: [{ phone: "555" }],
      byKey: { a: { ssn: "222" } },
      maybe: "333",
    };
    expect(redactExampleValue(example, schema, noRefs)).toEqual({
      profile: { nickname: REDACTED, city: "Recife" },
      contacts: [{ phone: REDACTED }],
      byKey: { a: {} },
    });
  });
});
