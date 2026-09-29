import type { CatalogEntry, CatalogField } from "./catalog-entry.ts";
import { isJsonRecord, type JsonRecord } from "./stable-json.ts";

export const REDACTED = "[redacted]";

/**
 * Spec §16.4: `sensitive` never reaches a model; `personal` values are redacted in
 * examples (the model may read real personal data only inside the tenant, with the
 * asker's read permission, which is enforced at query time, not here).
 */
const redactExample = (example: unknown, fields: readonly CatalogField[]): unknown => {
  if (!isJsonRecord(example)) return example;
  const byName = new Map(fields.map((field) => [field.name, field]));
  const entries = Object.entries(example).flatMap(([key, value]): [string, unknown][] => {
    const pii = byName.get(key)?.pii;
    if (pii === "sensitive") return [];
    return [[key, pii === "personal" ? REDACTED : value]];
  });
  return Object.fromEntries(entries);
};

const redactField = (field: CatalogField): CatalogField =>
  field.pii === "personal" && field.examples !== undefined ? { ...field, examples: field.examples.map(() => REDACTED) } : field;

const readPii = (node: unknown): unknown => (isJsonRecord(node) ? node["x-pii"] : undefined);

/** Prunes `sensitive` properties and redacts `personal` examples at every object level. */
const redactJsonSchema = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(redactJsonSchema);
  if (!isJsonRecord(node)) return node;
  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(node)) result[key] = key === "properties" ? redactProperties(value) : redactJsonSchema(value);
  if (readPii(node) === "personal" && Array.isArray(node["examples"])) result["examples"] = node["examples"].map(() => REDACTED);
  if (Array.isArray(node["required"]) && isJsonRecord(node["properties"])) {
    const kept = result["properties"] as JsonRecord;
    result["required"] = node["required"].filter((name) => typeof name === "string" && name in kept);
  }
  return result;
};

const redactProperties = (properties: unknown): unknown => {
  if (!isJsonRecord(properties)) return properties;
  const kept = Object.entries(properties).filter(([, child]) => readPii(child) !== "sensitive");
  return Object.fromEntries(kept.map(([name, child]) => [name, redactJsonSchema(child)]));
};

export const toAiCatalogEntry = (entry: CatalogEntry): CatalogEntry | undefined => {
  if (entry.pii === "sensitive") return undefined;
  const fields = entry.fields.filter((field) => field.pii !== "sensitive").map(redactField);
  const jsonSchema = redactJsonSchema(entry.jsonSchema) as JsonRecord;
  const examples = entry.examples.map((example) => redactExample(example, entry.fields));
  jsonSchema["examples"] = examples;
  return { ...entry, examples, fields, jsonSchema };
};
