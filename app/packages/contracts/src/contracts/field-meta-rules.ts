import { z } from "zod";
import { readFieldMeta } from "./field-meta.ts";
import type { PiiLevel } from "./primitives/catalog-meta.schema.ts";

export type FieldMetaProblem = { path: string; issue: "MISSING_FIELD_META" | "PII_BELOW_FIELDS" };

export type FieldMetaInspection = { problems: FieldMetaProblem[]; maxPii: PiiLevel };

const PII_RANK: Record<PiiLevel, number> = { none: 0, personal: 1, sensitive: 2 };

export const isPiiBelow = (level: PiiLevel, other: PiiLevel): boolean => PII_RANK[level] < PII_RANK[other];

export const maxPii = (levels: readonly PiiLevel[]): PiiLevel =>
  levels.reduce<PiiLevel>((highest, level) => (isPiiBelow(highest, level) ? level : highest), "none");

type ChildSchema = { schema: z.core.$ZodType; segment: string };

type LooseDef = {
  type: string;
  innerType?: z.core.$ZodType;
  element?: z.core.$ZodType;
  valueType?: z.core.$ZodType;
  options?: readonly z.core.$ZodType[];
  left?: z.core.$ZodType;
  right?: z.core.$ZodType;
  items?: readonly z.core.$ZodType[];
  in?: z.core.$ZodType;
  shape?: Record<string, z.core.$ZodType>;
  catchall?: z.core.$ZodType;
};

const WRAPPER_TYPES = new Set([
  "optional",
  "nullable",
  "default",
  "prefault",
  "readonly",
  "catch",
  "nonoptional",
  "success",
]);

/** Schemas nested in a non-object schema; `z.lazy` is skipped (recursive types). */
const childSchemasOf = (def: LooseDef): ChildSchema[] => {
  const wrap = (schema: z.core.$ZodType | undefined, segment = ""): ChildSchema[] =>
    schema === undefined ? [] : [{ schema, segment }];
  if (WRAPPER_TYPES.has(def.type)) return wrap(def.innerType);
  if (def.type === "array") return wrap(def.element, "[]");
  if (def.type === "set") return wrap(def.valueType, "[]");
  if (def.type === "record" || def.type === "map") return wrap(def.valueType, "{}");
  if (def.type === "union") return (def.options ?? []).flatMap((option) => wrap(option));
  if (def.type === "intersection") return [...wrap(def.left), ...wrap(def.right)];
  if (def.type === "tuple") return (def.items ?? []).flatMap((item) => wrap(item, "[]"));
  if (def.type === "pipe") return wrap(def.in);
  return [];
};

const joinPath = (path: string, segment: string): string =>
  segment === ""
    ? path
    : segment.startsWith("[") || segment.startsWith("{") || path === ""
      ? `${path}${segment}`
      : `${path}.${segment}`;

const inspectField = (
  name: string,
  field: z.core.$ZodType,
  path: string,
  seen: Set<z.core.$ZodType>,
): FieldMetaInspection => {
  const fieldPath = joinPath(path, name);
  const meta = readFieldMeta(field, z.globalRegistry);
  const inner = inspectSchema(field, fieldPath, seen);
  if (meta === undefined) {
    return { problems: [{ path: fieldPath, issue: "MISSING_FIELD_META" }, ...inner.problems], maxPii: inner.maxPii };
  }
  const below: FieldMetaProblem[] = isPiiBelow(meta.pii, inner.maxPii)
    ? [{ path: fieldPath, issue: "PII_BELOW_FIELDS" }]
    : [];
  return { problems: [...below, ...inner.problems], maxPii: maxPii([meta.pii, inner.maxPii]) };
};

const mergeInspections = (inspections: readonly FieldMetaInspection[]): FieldMetaInspection => ({
  problems: inspections.flatMap((inspection) => inspection.problems),
  maxPii: maxPii(inspections.map((inspection) => inspection.maxPii)),
});

/**
 * Undeclared keys of an object take the catchall schema (`.catchall(x)`); its own
 * pii (when it has meta) counts towards the object's, and its nested fields are
 * walked like a record value. `z.strictObject`'s never and `z.looseObject`'s
 * unknown carry nothing to walk.
 */
const inspectCatchall = (
  catchall: z.core.$ZodType | undefined,
  path: string,
  seen: Set<z.core.$ZodType>,
): FieldMetaInspection => {
  if (catchall === undefined) return { problems: [], maxPii: "none" };
  const catchallPath = joinPath(path, "{}");
  const inner = inspectSchema(catchall, catchallPath, seen);
  const own = readFieldMeta(catchall, z.globalRegistry)?.pii ?? "none";
  return { problems: inner.problems, maxPii: maxPii([own, inner.maxPii]) };
};

/**
 * Walks every object field reachable from `schema` (through wrappers, arrays,
 * records, unions, catchalls): each field needs `description` + `pii`, and a field's pii
 * must cover the highest pii of the fields nested in it.
 */
export function inspectSchema(
  schema: z.core.$ZodType,
  path = "",
  seen = new Set<z.core.$ZodType>(),
): FieldMetaInspection {
  if (seen.has(schema)) return { problems: [], maxPii: "none" };
  const nextSeen = new Set(seen).add(schema);
  const def = schema._zod.def as LooseDef;
  if (def.type === "object") {
    const fields = Object.entries(def.shape ?? {}).map(([name, field]) => inspectField(name, field, path, nextSeen));
    return mergeInspections([...fields, inspectCatchall(def.catchall, path, nextSeen)]);
  }
  return mergeInspections(
    childSchemasOf(def).map((child) => inspectSchema(child.schema, joinPath(path, child.segment), nextSeen)),
  );
}
