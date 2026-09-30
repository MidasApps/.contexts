import { parseFakeDirectives } from "./fake-scenarios.ts";

/**
 * JSON answers of the fake model when a caller asks for structured output
 * (`responseFormat: json`): Mastra's LLM guardrail detectors, workflow steps and
 * scorers. Detectors are recognized by the shape of their result schema
 * (`@mastra/core` 1.71 `*Result` types) and flag only on their directive
 * (`[[fake:injection]]`, `[[fake:pii]]`, `[[fake:moderation]]`); anything else
 * gets the smallest object the schema allows. `[[fake:json {...}]]` scripts the
 * object verbatim.
 */

type JsonSchemaLike = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  items?: JsonSchemaLike;
  enum?: unknown[];
  anyOf?: JsonSchemaLike[];
  oneOf?: JsonSchemaLike[];
  const?: unknown;
  default?: unknown;
};

const asSchema = (value: unknown): JsonSchemaLike => (typeof value === "object" && value !== null ? value : {});

const typesOf = (schema: JsonSchemaLike): string[] => {
  const own = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const nested = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].flatMap(typesOf);
  return [...own, ...nested];
};

const EMPTY_BY_TYPE: Record<string, () => unknown> = {
  null: () => null,
  array: () => [],
  string: () => "",
  number: () => 0,
  integer: () => 0,
  boolean: () => false,
};

/** Smallest value a schema accepts: null when nullable, else an empty value of its type. */
export const minimalValueFor = (rawSchema: unknown): unknown => {
  const schema = asSchema(rawSchema);
  if (schema.const !== undefined) return schema.const;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum !== undefined && schema.enum.length > 0) return schema.enum[0];
  const types = typesOf(schema);
  if (types.includes("null")) return null;
  if (types.includes("object") || schema.properties !== undefined) {
    return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => [key, minimalValueFor(value)]));
  }
  const empty = types.map((type) => EMPTY_BY_TYPE[type]).find((build) => build !== undefined);
  return empty === undefined ? null : empty();
};

const hasDirective = (text: string, scenario: string): boolean =>
  parseFakeDirectives(text).some((directive) => directive.scenario === scenario);

// Mastra's PIIDetector prompt ends with `Content: "<content>"`; its redaction offsets are relative to that content.
const PII_CONTENT_MARKER = 'Content: "';
const detectedContentOf = (text: string): string => {
  const at = text.lastIndexOf(PII_CONTENT_MARKER);
  if (at < 0) return text;
  const start = at + PII_CONTENT_MARKER.length;
  const end = text.lastIndexOf('"');
  return end > start ? text.slice(start, end) : text.slice(start);
};

const detectorVerdict = (keys: ReadonlySet<string>, text: string): Record<string, unknown> | undefined => {
  if (keys.has("category_scores")) {
    return hasDirective(text, "moderation")
      ? { category_scores: [{ category: "harassment", score: 1 }], reason: "fake moderation directive" }
      : undefined;
  }
  if (keys.has("categories") && keys.has("detections")) {
    if (!hasDirective(text, "pii")) return undefined;
    const start = Math.max(0, detectedContentOf(text).indexOf("[[fake:pii]]"));
    const detection = { type: "email", value: "[[fake:pii]]", confidence: 1, start, end: start + 12, redacted_value: "[EMAIL]" };
    return { categories: [{ type: "email", score: 1 }], detections: [detection] };
  }
  if (keys.has("categories")) {
    return hasDirective(text, "injection") ? { categories: [{ type: "injection", score: 1 }], reason: "fake injection directive" } : undefined;
  }
  return undefined;
};

/**
 * JSON text answering a structured-output call.
 * @param schema the call's `responseFormat.schema` (JSON Schema).
 * @param text every text of the prompt; detectors put the checked content there.
 */
export const buildFakeJsonAnswer = (schema: unknown, text: string): string => {
  const scripted = parseFakeDirectives(text).find((directive) => directive.scenario === "json");
  if (scripted !== undefined) return JSON.stringify(scripted.args);
  const base = minimalValueFor(schema);
  const keys = new Set(Object.keys(asSchema(schema).properties ?? {}));
  const verdict = detectorVerdict(keys, text);
  const merged = verdict === undefined || typeof base !== "object" || base === null ? (verdict ?? base) : { ...base, ...verdict };
  return JSON.stringify(merged);
};
