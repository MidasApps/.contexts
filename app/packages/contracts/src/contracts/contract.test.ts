import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineContract } from "./contract.ts";

const buildMeta = (overrides: Record<string, unknown> = {}) => ({
  id: "example.Thing",
  kind: "entity",
  description: "A thing used by contract tests.",
  examples: [{ title: "First" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  ...overrides,
});

const omitKey = (record: Record<string, unknown>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

const field = (pii: "none" | "personal" | "sensitive", description = "A field.") => ({ description, pii });

const buildThingSchema = () => z.object({ title: z.string().meta(field("none", "Title shown in lists.")) });

describe("defineContract", () => {
  it("returns a descriptor with the same schema instance and parsed meta", () => {
    const schema = buildThingSchema();
    const contract = defineContract(schema, buildMeta());
    expect(contract.schema).toBe(schema);
    expect(contract).toMatchObject({ id: "example.Thing", meta: { kind: "entity", tenancyScope: "organization" } });
  });

  it("does not register anything in the zod global registry", () => {
    const schema = buildThingSchema();
    defineContract(schema, buildMeta());
    expect(z.globalRegistry.get(schema)).toBeUndefined();
  });

  it.each(["description", "pii"])("rejects a contract without %s", (key) => {
    expect(() => defineContract(buildThingSchema(), omitKey(buildMeta(), key))).toThrow(
      expect.objectContaining({ code: "INVALID_CONTRACT_META" }),
    );
  });

  it("rejects an id outside the <context>.<Name> format", () => {
    expect(() => defineContract(buildThingSchema(), buildMeta({ id: "Thing" }))).toThrow(
      expect.objectContaining({ code: "INVALID_CONTRACT_META" }),
    );
  });

  it("rejects a contract without examples", () => {
    expect(() => defineContract(buildThingSchema(), buildMeta({ examples: [] }))).toThrow(
      expect.objectContaining({ code: "INVALID_CONTRACT_META" }),
    );
  });

  it("rejects a top-level field without description or pii", () => {
    const schema = z.object({
      title: z.string().meta(field("none")),
      owner: z.string().meta({ description: "Owner without pii." }),
      tag: z.string(),
    });
    expect(() => defineContract(schema, buildMeta())).toThrow(
      expect.objectContaining({ code: "MISSING_FIELD_META", fields: ["owner", "tag"] }),
    );
  });

  it("reads field metadata through optional, nullable and default wrappers", () => {
    const schema = z.object({
      note: z.string().meta(field("personal")).optional(),
      memo: z.string().nullable().meta(field("none")),
      level: z.string().meta(field("none")).default("low"),
    });
    expect(() => defineContract(schema, buildMeta({ pii: "personal" }))).not.toThrow();
  });

  it("requires meta on fields of nested objects, arrays, records and unions", () => {
    const schema = z.object({
      address: z.object({ street: z.string() }).meta(field("personal")),
      items: z.array(z.object({ sku: z.string() })).meta(field("none")),
      labels: z.record(z.string(), z.object({ text: z.string() })).meta(field("none")),
      payment: z
        .discriminatedUnion("kind", [z.object({ kind: z.literal("pix"), key: z.string() })])
        .meta(field("none")),
    });
    expect(() => defineContract(schema, buildMeta({ pii: "personal" }))).toThrow(
      expect.objectContaining({
        code: "MISSING_FIELD_META",
        fields: ["address.street", "items[].sku", "labels{}.text", "payment.kind", "payment.key"],
      }),
    );
  });

  it("rejects a field whose pii is below the pii of its nested fields", () => {
    const schema = z.object({
      profile: z.object({ ssn: z.string().meta(field("sensitive")) }).meta(field("none")),
    });
    expect(() => defineContract(schema, buildMeta({ pii: "sensitive" }))).toThrow(
      expect.objectContaining({ code: "PII_BELOW_FIELDS", fields: ["profile"] }),
    );
  });

  it("rejects a contract whose pii is below the pii of its fields", () => {
    const schema = z.object({ email: z.email().meta(field("personal")) });
    expect(() => defineContract(schema, buildMeta({ pii: "none" }))).toThrow(
      expect.objectContaining({ code: "PII_BELOW_FIELDS", fields: ["<contract>"] }),
    );
  });

  it("accepts nested fields whose parent pii covers them", () => {
    const schema = z.object({
      profile: z.object({ ssn: z.string().meta(field("sensitive")) }).nullable().meta(field("sensitive")),
    });
    expect(() => defineContract(schema, buildMeta({ pii: "sensitive" }))).not.toThrow();
  });
});
