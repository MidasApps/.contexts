import { z } from "zod";
import { CUSTOM_META_KEYS } from "../../src/contracts/primitives/catalog-meta.schema.ts";
import type { RegisteredContract } from "../../src/contracts/registry.ts";
import { isJsonRecord, type JsonRecord } from "./stable-json.ts";

const RAW_META_KEYS: ReadonlySet<string> = new Set(CUSTOM_META_KEYS);

/** Keys whose value is a map of name → subschema: the names are not keywords. */
const SCHEMA_MAP_KEYS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
  "schemas",
]);

/** Keys holding instance data, not subschemas. */
const DATA_KEYS = new Set(["examples", "default", "const", "enum"]);

/** Contracts reference each other through OpenAPI components (spec §16.4: nested contracts become `$ref`). */
export const componentRef = (id: string): string => `#/components/schemas/${id}`;

/** `z.toJSONSchema` copies every meta key; custom ones must travel as `x-<key>`. */
export const renameCustomMetaKeys = (jsonSchema: JsonRecord): void => {
  for (const key of CUSTOM_META_KEYS) {
    if (!(key in jsonSchema)) continue;
    jsonSchema[`x-${key}`] = jsonSchema[key];
    delete jsonSchema[key];
  }
};

/**
 * One JSON Schema (draft 2020-12, OpenAPI 3.1 compatible) per contract, keyed by id.
 * `$schema` and `$id` are dropped so the same object serves the catalog and OpenAPI.
 */
export const buildJsonSchemas = (contracts: readonly RegisteredContract[]): Map<string, JsonRecord> => {
  const idRegistry = z.registry<{ id: string }>();
  for (const contract of contracts) idRegistry.add(contract.schema, { id: contract.id });
  const { schemas } = z.toJSONSchema(idRegistry, {
    uri: componentRef,
    override: (ctx) => renameCustomMetaKeys(ctx.jsonSchema as JsonRecord),
  });
  const result = new Map<string, JsonRecord>();
  for (const contract of contracts) {
    const schema = { ...(schemas[contract.id] ?? {}) } as JsonRecord;
    delete schema["$schema"];
    delete schema["$id"];
    result.set(contract.id, schema);
  }
  return result;
};

const walkSchemaMap = (map: unknown, path: string, found: string[]): void => {
  if (!isJsonRecord(map)) return;
  for (const [name, child] of Object.entries(map)) walkSchemaNode(child, `${path}/${name}`, found);
};

function walkSchemaNode(node: unknown, path: string, found: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => walkSchemaNode(child, `${path}/${index}`, found));
    return;
  }
  if (!isJsonRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (RAW_META_KEYS.has(key)) found.push(`${path}/${key}`);
    if (DATA_KEYS.has(key) || key.startsWith("x-")) continue;
    if (SCHEMA_MAP_KEYS.has(key)) walkSchemaMap(value, `${path}/${key}`, found);
    else walkSchemaNode(value, `${path}/${key}`, found);
  }
}

/** JSON pointers of custom meta keys left raw (not `x-*`) anywhere in a schema tree. */
export const findRawMetaKeys = (schema: unknown): string[] => {
  const found: string[] = [];
  walkSchemaNode(schema, "#", found);
  return found;
};
