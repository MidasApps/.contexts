import { describe, expect, it } from "vitest";
import { draftOfValue, readJsonInput, serverProblemsOf, switchJsonInputMode } from "./json-input-draft.ts";
import { planJsonSchemaFields } from "./json-schema-plan.ts";

const NOTE = planJsonSchemaFields({
  type: "object",
  properties: { title: { type: "string", minLength: 1, maxLength: 200 }, body: { type: "string", maxLength: 10000 } },
  required: ["title"],
});
const MIXED = planJsonSchemaFields({
  type: "object",
  properties: { days: { type: "integer", minimum: 1, maximum: 30, default: 7 }, ratio: { type: "number" }, dryRun: { type: "boolean" }, mode: { type: "string", enum: ["fast", "full"] } },
  required: ["days", "dryRun", "mode"],
});

describe("json input draft", () => {
  it("starts from the defaults and reads back the typed value, leaving out empty optional fields", () => {
    const draft = draftOfValue(MIXED, {});
    expect(draft.fields).toEqual({ days: "7", ratio: "", dryRun: false, mode: "" });
    const read = readJsonInput(MIXED, { ...draft, fields: { ...draft.fields, mode: "full", ratio: "0,5" } });
    expect(read).toEqual({ ok: true, value: { days: 7, ratio: 0.5, dryRun: false, mode: "full" } });
  });

  it("names each field's problem with the form error copy", () => {
    const read = readJsonInput(NOTE, draftOfValue(NOTE, { body: "x".repeat(10001) }));
    expect(read).toEqual({
      ok: false,
      problems: {
        fields: {
          title: { key: "common.form.errors.required" },
          body: { key: "common.form.errors.tooLong", values: { maximum: 10000 } },
        },
        json: false,
      },
    });
    const numbers = readJsonInput(MIXED, { ...draftOfValue(MIXED, {}), fields: { days: "2.5", ratio: "abc", dryRun: true, mode: "fast" } });
    expect(numbers.ok ? null : numbers.problems.fields).toEqual({ days: { key: "common.form.errors.notInteger" }, ratio: { key: "common.form.errors.invalid" } });
    const range = readJsonInput(MIXED, { ...draftOfValue(MIXED, {}), fields: { days: "31", ratio: "", dryRun: true, mode: "fast" } });
    expect(range.ok ? null : range.problems.fields).toEqual({ days: { key: "common.form.errors.tooBig", values: { maximum: 30 } } });
  });

  it("edits as JSON and back, keeping what was typed", () => {
    const fields = { ...draftOfValue(NOTE, {}), fields: { title: "Follow-up", body: "" } };
    const asJson = switchJsonInputMode(NOTE, fields, "json");
    expect(asJson).toEqual({ ok: true, draft: { mode: "json", fields: fields.fields, json: '{\n  "title": "Follow-up"\n}' } });
    const back = switchJsonInputMode(NOTE, { ...fields, mode: "json", json: '{ "title": "Call", "body": "Monday" }' }, "fields");
    expect(back).toEqual({ ok: true, draft: { mode: "fields", fields: { title: "Call", body: "Monday" }, json: '{ "title": "Call", "body": "Monday" }' } });
    expect(switchJsonInputMode(NOTE, { ...fields, mode: "json", json: "[1]" }, "fields")).toEqual({ ok: false });
  });

  it("reads JSON text as an object only", () => {
    const plan = planJsonSchemaFields({ type: "object", properties: { tags: { type: "array" } } });
    expect(readJsonInput(plan, { mode: "json", fields: {}, json: '{ "tags": ["a"] }' })).toEqual({ ok: true, value: { tags: ["a"] } });
    expect(readJsonInput(plan, { mode: "json", fields: {}, json: "" })).toEqual({ ok: true, value: {} });
    expect(readJsonInput(plan, { mode: "json", fields: {}, json: "nope" })).toEqual({ ok: false, problems: { fields: {}, json: true } });
    expect(readJsonInput(planJsonSchemaFields(null), draftOfValue(planJsonSchemaFields(null), {}))).toEqual({ ok: true, value: {} });
  });

  it("maps the server's inputData.* field issues to the fields shown, and says when some are not", () => {
    const details = [
      { field: "inputData.title", issue: "INVALID" },
      { field: "inputData.extra", issue: "INVALID" },
    ];
    expect(serverProblemsOf(NOTE, "fields", details)).toEqual({ fields: { title: { key: "common.form.errors.invalid" } }, unmatched: true });
    expect(serverProblemsOf(NOTE, "fields", [{ field: "inputData.title", issue: "INVALID_VALUE" }])).toEqual({ fields: { title: { key: "common.form.errors.invalidOption" } }, unmatched: false });
    expect(serverProblemsOf(NOTE, "json", details)).toEqual({ fields: {}, unmatched: true });
  });
});
