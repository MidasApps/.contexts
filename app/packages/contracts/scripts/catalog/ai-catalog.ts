import { isPiiBelow } from "../../src/contracts/field-meta-rules.ts";
import type { PiiLevel } from "../../src/contracts/primitives/catalog-meta.schema.ts";
import type { CatalogEntry } from "./catalog-entry.ts";
import { componentRef } from "./json-schema.ts";
import { isJsonRecord, type JsonRecord } from "./stable-json.ts";

export const REDACTED = "[redacted]";

/** Sentinel: the value must not appear at all. */
const DROP: unique symbol = Symbol("drop");

/** Resolves a `$ref` to a schema; `undefined` means the target is not in the AI catalog. */
export type RefResolver = (ref: string) => JsonRecord | undefined;

const COMBINATORS = ["anyOf", "oneOf", "allOf"] as const;

const PII_LEVELS: ReadonlySet<unknown> = new Set(["none", "personal", "sensitive"]);

const higher = (left: PiiLevel, right: PiiLevel): PiiLevel => (isPiiBelow(left, right) ? right : left);

/**
 * `x-pii` may sit on the node or, for wrapped fields (`.meta().nullable()`), on an
 * `anyOf`/`oneOf`/`allOf` member; the highest level wins.
 */
const membersOf = (node: JsonRecord): unknown[] =>
  COMBINATORS.flatMap((key): unknown[] => {
    const members: unknown = node[key];
    return Array.isArray(members) ? members : [];
  });

const effectivePii = (node: unknown): PiiLevel => {
  if (!isJsonRecord(node)) return "none";
  const own = PII_LEVELS.has(node["x-pii"]) ? (node["x-pii"] as PiiLevel) : "none";
  return membersOf(node).reduce<PiiLevel>((level, member) => higher(level, effectivePii(member)), own);
};

/** True when the node (or a combinator member) declares `x-pii` itself. */
const declaresPii = (node: unknown): boolean =>
  isJsonRecord(node) &&
  (PII_LEVELS.has(node["x-pii"]) || typeof node["$ref"] === "string" || membersOf(node).some(declaresPii));

const referencesAny = (node: unknown, refs: ReadonlySet<string>): boolean => {
  if (Array.isArray(node)) return node.some((child) => referencesAny(child, refs));
  if (!isJsonRecord(node)) return false;
  if (typeof node["$ref"] === "string" && refs.has(node["$ref"])) return true;
  return Object.values(node).some((child) => referencesAny(child, refs));
};

const redactObject = (value: JsonRecord, node: JsonRecord, resolve: RefResolver): JsonRecord => {
  const properties = isJsonRecord(node["properties"]) ? node["properties"] : {};
  // An undeclared key is classified only by an additionalProperties schema that
  // declares its own pii (a catchall or record value with meta, or a contract $ref);
  // otherwise it cannot be classified, so it never goes out.
  const additional = declaresPii(node["additionalProperties"])
    ? (node["additionalProperties"] as JsonRecord)
    : undefined;
  const entries = Object.entries(value).flatMap(([key, child]): [string, unknown][] => {
    const childNode = properties[key] ?? additional;
    if (childNode === undefined) return [];
    const redacted = redactNode(child, childNode, resolve);
    return redacted === DROP ? [] : [[key, redacted]];
  });
  return Object.fromEntries(entries);
};

function redactNode(value: unknown, schema: unknown, resolve: RefResolver): unknown {
  if (!isJsonRecord(schema)) return value;
  if (typeof schema["$ref"] === "string") {
    const target = resolve(schema["$ref"]);
    return target === undefined ? DROP : redactNode(value, target, resolve);
  }
  const pii = effectivePii(schema);
  if (pii === "sensitive") return DROP;
  if (pii === "personal") return REDACTED;
  let result: unknown = value;
  if (isJsonRecord(result)) result = redactObject(result, schema, resolve);
  if (Array.isArray(result) && isJsonRecord(schema["items"])) {
    const items = schema["items"];
    result = result.map((item) => redactNode(item, items, resolve)).filter((item) => item !== DROP);
  }
  // Unknown branch: apply every member; redaction is monotonic, so order does not matter.
  for (const member of membersOf(schema)) {
    result = redactNode(result, member, resolve);
    if (result === DROP) return DROP;
  }
  return result;
}

/** Walks the JSON Schema alongside an example value: drops `sensitive`, redacts `personal`. */
export const redactExampleValue = (value: unknown, schema: JsonRecord, resolve: RefResolver): unknown => {
  const redacted = redactNode(value, schema, resolve);
  return redacted === DROP ? undefined : redacted;
};

const pruneProperties = (properties: JsonRecord, droppedRefs: ReadonlySet<string>): JsonRecord =>
  Object.fromEntries(
    Object.entries(properties)
      .filter(([, child]) => effectivePii(child) !== "sensitive" && !referencesAny(child, droppedRefs))
      .map(([name, child]) => [name, pruneSchema(child, droppedRefs)]),
  );

/** Removes sensitive or dangling properties at every level and redacts personal examples/defaults. */
function pruneSchema(node: unknown, droppedRefs: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) return node.map((child) => pruneSchema(child, droppedRefs));
  if (!isJsonRecord(node)) return node;
  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] =
      key === "properties" && isJsonRecord(value)
        ? pruneProperties(value, droppedRefs)
        : pruneSchema(value, droppedRefs);
  }
  if (effectivePii(node) === "personal") {
    if (Array.isArray(node["examples"])) result["examples"] = node["examples"].map(() => REDACTED);
    if ("default" in node) result["default"] = REDACTED;
  }
  if (Array.isArray(node["required"]) && isJsonRecord(result["properties"])) {
    const kept = result["properties"];
    result["required"] = node["required"].filter((name) => typeof name === "string" && name in kept);
  }
  return result;
}

/** A contract goes out only if something non-sensitive remains (see decision 0005: field pii is authoritative). */
const isExcluded = (entry: CatalogEntry): boolean =>
  entry.pii === "sensitive" && entry.fields.every((field) => field.pii === "sensitive");

/**
 * Contract-level pii summarizes the fields (it may be `sensitive` because of one
 * field); redaction follows field pii, which is authoritative (spec §16.4).
 */
const withoutRootPii = (schema: JsonRecord): JsonRecord => {
  const copy = structuredClone(schema);
  delete copy["x-pii"];
  return copy;
};

const toAiEntry = (entry: CatalogEntry, droppedRefs: ReadonlySet<string>, resolve: RefResolver): CatalogEntry => {
  // Top-level field pii resolved by the registry is the authoritative source.
  const hiddenFields = new Set(entry.fields.filter((field) => field.pii === "sensitive").map((field) => field.name));
  const source = structuredClone(entry.jsonSchema);
  if (isJsonRecord(source["properties"])) {
    for (const name of hiddenFields) source["properties"][name] = { "x-pii": "sensitive" };
  }
  const redactionSchema = withoutRootPii(source);
  const examples = entry.examples.map((example) => redactExampleValue(example, redactionSchema, resolve));
  const jsonSchema = pruneSchema(source, droppedRefs) as JsonRecord;
  jsonSchema["examples"] = examples;
  const fields = entry.fields
    .filter(
      (field) =>
        !hiddenFields.has(field.name) &&
        isJsonRecord(jsonSchema["properties"]) &&
        field.name in jsonSchema["properties"],
    )
    .map((field) =>
      field.pii === "personal" && field.examples !== undefined
        ? { ...field, examples: field.examples.map(() => REDACTED) }
        : field,
    );
  return { ...entry, examples, fields, jsonSchema };
};

/**
 * Spec §16.4: `sensitive` never reaches a model; `personal` values are redacted in
 * examples (real personal data reaches the model only inside the tenant, with the
 * asker's read permission, enforced at query time).
 */
export const buildAiCatalog = (entries: readonly CatalogEntry[]): CatalogEntry[] => {
  const dropped = entries.filter(isExcluded);
  const droppedRefs = new Set(dropped.map((entry) => componentRef(entry.id)));
  const schemasByRef = new Map(
    entries
      .filter((entry) => !isExcluded(entry))
      .map((entry) => [componentRef(entry.id), withoutRootPii(entry.jsonSchema)]),
  );
  const resolve: RefResolver = (ref) => schemasByRef.get(ref);
  return entries.filter((entry) => !isExcluded(entry)).map((entry) => toAiEntry(entry, droppedRefs, resolve));
};
