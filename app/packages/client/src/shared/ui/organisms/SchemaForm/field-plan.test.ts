import { defineContract } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { planSchemaForm, SchemaFormDefinitionError } from "./field-plan.ts";
import { FixtureNoteContract } from "./schema-form.fixture.ts";

const allowAll = () => true;
const denyAll = () => false;

const fieldNames = (plan: ReturnType<typeof planSchemaForm>) =>
  plan.sections.map((section) => [section.group, section.fields.map((field) => field.name)]);

describe("planSchemaForm", () => {
  it("orders fields by ui.order and groups them in sections of first appearance", () => {
    const plan = planSchemaForm(FixtureNoteContract, { can: allowAll });
    expect(fieldNames(plan)).toEqual([
      [undefined, ["title", "body"]],
      ["fixture.groups.details", ["priority", "budget", "copies"]],
      ["fixture.groups.schedule", ["dueAt", "timeZone"]],
      [undefined, ["pinned", "internalCode"]],
    ]);
  });

  it("infers widgets: enums → select, booleans → switch, Money → money, ISO datetime → datetime", () => {
    const fields = planSchemaForm(FixtureNoteContract, { can: allowAll }).sections.flatMap((section) => section.fields);
    const byName = Object.fromEntries(fields.map((field) => [field.name, field]));
    expect(byName["title"]?.widget).toBe("text");
    expect(byName["body"]?.widget).toBe("text");
    expect(byName["priority"]).toMatchObject({ widget: "select", options: ["low", "normal", "high"], required: true });
    expect(byName["pinned"]).toMatchObject({ widget: "switch", required: false });
    expect(byName["budget"]?.widget).toBe("money");
    expect(byName["copies"]).toMatchObject({ widget: "number", integer: true, required: false });
    expect(byName["dueAt"]?.widget).toBe("datetime");
    expect(byName["timeZone"]?.widget).toBe("timeZone");
    expect(byName["title"]).toMatchObject({ labelKey: "fixture.note.title", required: true });
  });

  it("keeps hidden widgets and fields the viewer cannot see out of the rendered sections", () => {
    const plan = planSchemaForm(FixtureNoteContract, { can: denyAll });
    const rendered = plan.sections.flatMap((section) => section.fields.map((field) => field.name));
    expect(rendered).not.toContain("id");
    expect(rendered).not.toContain("internalCode");
    expect(plan.carried).toEqual(["id", "internalCode"]);
  });

  it("shows a visibleWith field only when can(permission) is true", () => {
    const asked: string[] = [];
    planSchemaForm(FixtureNoteContract, { can: (permission) => (asked.push(permission), true) });
    expect(asked).toEqual(["fixture.note.admin"]);
  });

  it("carries fields whose type has no widget (arrays, nested objects) without rendering them", () => {
    const contract = defineContract(
      z.object({
        tags: z.array(z.string()).meta({ description: "Tags.", pii: "none" }),
        name: z.string().meta({ description: "Name.", pii: "none", ui: { labelKey: "x.name" } }),
      }),
      { id: "fixture.Tags", kind: "command", description: "d", examples: [{}], pii: "none", tenancyScope: "user", relations: [] },
    );
    const plan = planSchemaForm(contract, { can: allowAll });
    expect(plan.carried).toEqual(["tags"]);
    expect(plan.sections[0]?.fields.map((field) => field.name)).toEqual(["name"]);
  });

  it("rejects a rendered field without labelKey and a widget that does not fit the type", () => {
    const meta = { kind: "command", description: "d", examples: [{}], pii: "none", tenancyScope: "user", relations: [] };
    const unlabeled = defineContract(z.object({ name: z.string().meta({ description: "Name.", pii: "none" }) }), {
      ...meta,
      id: "fixture.Unlabeled",
    });
    expect(() => planSchemaForm(unlabeled, { can: allowAll })).toThrow(SchemaFormDefinitionError);
    const mismatch = defineContract(
      z.object({ name: z.string().meta({ description: "Name.", pii: "none", ui: { widget: "select", labelKey: "x.name" } }) }),
      { ...meta, id: "fixture.Mismatch" },
    );
    expect(() => planSchemaForm(mismatch, { can: allowAll })).toThrow(/select/);
  });
});
