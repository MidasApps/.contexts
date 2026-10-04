import { describe, expect, it } from "vitest";
import { planJsonSchemaFields } from "./json-schema-plan.ts";

// What `z.toJSONSchema` emits for the workflows' Zod input schemas (probed on zod 4).
const NOTE_INPUT = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    body: { type: "string", maxLength: 10000 },
  },
  required: ["title"],
  additionalProperties: false,
};

describe("planJsonSchemaFields", () => {
  it("renders nothing without a schema or without properties", () => {
    expect(planJsonSchemaFields(null)).toEqual({ kind: "none" });
    expect(planJsonSchemaFields({ type: "object", properties: {}, additionalProperties: false })).toEqual({
      kind: "none",
    });
  });

  it("plans a text and a long-text field with their limits and requiredness", () => {
    const plan = planJsonSchemaFields(NOTE_INPUT);
    expect(plan).toEqual({
      kind: "fields",
      fields: [
        {
          name: "title",
          kind: "text",
          required: true,
          title: undefined,
          labelKey: undefined,
          options: [],
          minLength: 1,
          maxLength: 200,
          minimum: undefined,
          maximum: undefined,
          defaultValue: undefined,
        },
        {
          name: "body",
          kind: "textarea",
          required: false,
          title: undefined,
          labelKey: undefined,
          options: [],
          minLength: undefined,
          maxLength: 10000,
          minimum: undefined,
          maximum: undefined,
          defaultValue: undefined,
        },
      ],
    });
  });

  it("plans numbers, integers, switches and enums, and keeps contract ui meta (label key, widget, order)", () => {
    const plan = planJsonSchemaFields({
      type: "object",
      properties: {
        mode: { type: "string", enum: ["fast", "full"] },
        days: { type: "integer", minimum: 1, maximum: 9007199254740991, default: 7 },
        ratio: { type: "number", minimum: 0, maximum: 1 },
        dryRun: { type: "boolean", title: "Dry run" },
        note: { type: "string", ui: { widget: "textarea", labelKey: "example.note.body", order: 1 } },
      },
      required: ["mode", "days", "dryRun"],
    });
    expect(plan.kind).toBe("fields");
    if (plan.kind !== "fields") return;
    expect(plan.fields.map((field) => [field.name, field.kind])).toEqual([
      ["note", "textarea"],
      ["mode", "select"],
      ["days", "integer"],
      ["ratio", "number"],
      ["dryRun", "switch"],
    ]);
    expect(plan.fields[0]?.labelKey).toBe("example.note.body");
    expect(plan.fields[1]?.options).toEqual(["fast", "full"]);
    // A field with a default is filled in for the user, so it is not "required" to type.
    expect(plan.fields[2]).toMatchObject({ required: false, minimum: 1, maximum: undefined, defaultValue: 7 });
    expect(plan.fields[4]).toMatchObject({ required: false, title: "Dry run" });
  });

  it("falls back to JSON for shapes a form cannot hold", () => {
    expect(
      planJsonSchemaFields({ type: "object", properties: { tags: { type: "array", items: { type: "string" } } } }),
    ).toEqual({ kind: "json" });
    expect(
      planJsonSchemaFields({ type: "object", properties: { address: { type: "object", properties: {} } } }),
    ).toEqual({ kind: "json" });
    expect(
      planJsonSchemaFields({ type: "object", properties: { id: { anyOf: [{ type: "string" }, { type: "null" }] } } }),
    ).toEqual({ kind: "json" });
    expect(planJsonSchemaFields({ anyOf: [{ type: "object" }] })).toEqual({ kind: "json" });
    expect(planJsonSchemaFields({ type: "object", properties: { mixed: { enum: ["a", 1] } } })).toEqual({
      kind: "json",
    });
  });
});
