import { describeServerIssue, type MessageDescriptor } from "#/shared/ui/organisms/SchemaForm/issue-messages.ts";
import type { JsonFieldPlan, JsonSchemaPlan } from "./json-schema-plan.ts";

export type JsonInputMode = "fields" | "json";

/** What the user is editing: one text (or switch) per field, and the JSON text of "edit as JSON". */
export type JsonInputDraft = {
  readonly mode: JsonInputMode;
  readonly fields: Readonly<Record<string, string | boolean>>;
  readonly json: string;
};

export type JsonInputProblems = {
  readonly fields: Readonly<Record<string, MessageDescriptor>>;
  /** The JSON text is not an object. */
  readonly json: boolean;
};

export type JsonInputRead = { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly problems: JsonInputProblems };

const ERRORS = "common.form.errors";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const fieldsOf = (plan: JsonSchemaPlan): readonly JsonFieldPlan[] => (plan.kind === "fields" ? plan.fields : []);

const textOf = (value: unknown): string => (value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value));

/** The draft of an input value (an initial value, or a schedule's stored input); defaults fill the gaps. */
export const draftOfValue = (plan: JsonSchemaPlan, value: Readonly<Record<string, unknown>>): JsonInputDraft => ({
  mode: plan.kind === "json" ? "json" : "fields",
  fields: Object.fromEntries(
    fieldsOf(plan).map((field) => {
      const current = value[field.name] ?? field.defaultValue;
      return [field.name, field.kind === "switch" ? current === true : textOf(current)];
    }),
  ),
  json: Object.keys(value).length === 0 ? "" : JSON.stringify(value, null, 2),
});

/** JSON text as an object (`{}` when empty), or `null` when it is not one. */
const parseObject = (text: string): Record<string, unknown> | null => {
  if (text.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// Decimal commas are how pt-BR and es-419 users type fractions.
const parseNumber = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text.trim().replace(",", ".")));

type FieldRead = { value?: unknown; problem?: MessageDescriptor };

const readNumber = (field: JsonFieldPlan, text: string): FieldRead => {
  const value = parseNumber(text);
  if (!Number.isFinite(value)) return { problem: { key: `${ERRORS}.invalid` } };
  if (field.kind === "integer" && !Number.isInteger(value)) return { problem: { key: `${ERRORS}.notInteger` } };
  if (field.minimum !== undefined && value < field.minimum) return { problem: { key: `${ERRORS}.tooSmall`, values: { minimum: field.minimum } } };
  if (field.maximum !== undefined && value > field.maximum) return { problem: { key: `${ERRORS}.tooBig`, values: { maximum: field.maximum } } };
  return { value };
};

const readText = (field: JsonFieldPlan, text: string): FieldRead => {
  if (field.minLength !== undefined && text.trim().length < field.minLength) return { problem: { key: `${ERRORS}.tooShort`, values: { minimum: field.minLength } } };
  if (field.maxLength !== undefined && text.length > field.maxLength) return { problem: { key: `${ERRORS}.tooLong`, values: { maximum: field.maxLength } } };
  return { value: text };
};

const readField = (field: JsonFieldPlan, raw: string | boolean | undefined): FieldRead => {
  if (field.kind === "switch") return { value: raw === true };
  const text = typeof raw === "string" ? raw : "";
  if (text.trim() === "") return field.required ? { problem: { key: `${ERRORS}.required` } } : {};
  if (field.kind === "number" || field.kind === "integer") return readNumber(field, text);
  if (field.kind === "select") return field.options.includes(text) ? { value: text } : { problem: { key: `${ERRORS}.invalidOption` } };
  return readText(field, text);
};

/**
 * The input to send, or every problem at once. Fields are checked against the schema's limits so
 * the user learns what to fix next to the field; the server validates again (rule `validation`).
 * An empty optional field is left out rather than sent as "".
 */
export const readJsonInput = (plan: JsonSchemaPlan, draft: JsonInputDraft): JsonInputRead => {
  if (plan.kind === "none") return { ok: true, value: {} };
  if (draft.mode === "json") {
    const value = parseObject(draft.json);
    return value === null ? { ok: false, problems: { fields: {}, json: true } } : { ok: true, value };
  }
  const value: Record<string, unknown> = {};
  const problems: Record<string, MessageDescriptor> = {};
  for (const field of fieldsOf(plan)) {
    const read = readField(field, draft.fields[field.name]);
    if (read.problem !== undefined) problems[field.name] = read.problem;
    else if (read.value !== undefined) value[field.name] = read.value;
  }
  return Object.keys(problems).length === 0 ? { ok: true, value } : { ok: false, problems: { fields: problems, json: false } };
};

/** What the fields hold, as far as it reads (an unparsable number stays as typed): the JSON view of the form. */
const looseValueOf = (plan: JsonSchemaPlan, draft: JsonInputDraft): Record<string, unknown> =>
  Object.fromEntries(
    fieldsOf(plan).flatMap((field): [string, unknown][] => {
      const raw = draft.fields[field.name];
      if (field.kind === "switch") return [[field.name, raw === true]];
      if (typeof raw !== "string" || raw.trim() === "") return [];
      const number = parseNumber(raw);
      return [[field.name, (field.kind === "number" || field.kind === "integer") && Number.isFinite(number) ? number : raw]];
    }),
  );

/** Switches between the fields and "edit as JSON"; going back to fields fails while the JSON is not an object. */
export const switchJsonInputMode = (plan: JsonSchemaPlan, draft: JsonInputDraft, mode: JsonInputMode): { ok: true; draft: JsonInputDraft } | { ok: false } => {
  if (mode === draft.mode) return { ok: true, draft };
  if (mode === "json") {
    const value = looseValueOf(plan, draft);
    return { ok: true, draft: { ...draft, mode, json: Object.keys(value).length === 0 ? "" : JSON.stringify(value, null, 2) } };
  }
  const value = parseObject(draft.json);
  if (value === null) return { ok: false };
  return { ok: true, draft: { ...draft, mode, fields: draftOfValue(plan, value).fields } };
};

const INPUT_PREFIX = "inputData.";

/**
 * `VALIDATION_FAILED.details` of a start or schedule call (`inputData.<field>`) on the fields
 * shown; `unmatched` when some issue has no field here (JSON mode, nested paths), so the caller
 * keeps the form-level alert.
 */
export const serverProblemsOf = (
  plan: JsonSchemaPlan,
  mode: JsonInputMode,
  details: readonly { readonly field: string; readonly issue: string }[],
): { fields: Record<string, MessageDescriptor>; unmatched: boolean } => {
  const names = new Set(mode === "fields" ? fieldsOf(plan).map((field) => field.name) : []);
  const fields: Record<string, MessageDescriptor> = {};
  let unmatched = false;
  for (const detail of details) {
    const name = detail.field.startsWith(INPUT_PREFIX) ? detail.field.slice(INPUT_PREFIX.length) : "";
    if (names.has(name)) fields[name] = describeServerIssue(detail.issue);
    else unmatched = true;
  }
  return { fields, unmatched };
};
