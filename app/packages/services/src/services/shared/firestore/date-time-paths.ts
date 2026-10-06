import type { z } from "zod";

/** A field path; `"[]"` stands for every element of an array. */
export type FieldPath = readonly string[];

type LooseDef = {
  type: string;
  format?: string;
  innerType?: z.core.$ZodType;
  element?: z.core.$ZodType;
  shape?: Record<string, z.core.$ZodType>;
};

const WRAPPER_TYPES = new Set(["optional", "nullable", "default", "prefault", "readonly", "catch", "nonoptional"]);

const unwrap = (schema: z.core.$ZodType): LooseDef => {
  let def = schema._zod.def as LooseDef;
  while (WRAPPER_TYPES.has(def.type) && def.innerType !== undefined) def = def.innerType._zod.def;
  return def;
};

const collect = (schema: z.core.$ZodType, prefix: FieldPath): FieldPath[] => {
  const def = unwrap(schema);
  // `IsoDateTimeSchema` (z.iso.datetime) is a string schema with format "datetime".
  if (def.type === "string" && def.format === "datetime") return [prefix];
  if (def.type === "array" && def.element !== undefined) return collect(def.element, [...prefix, "[]"]);
  if (def.type === "object" && def.shape !== undefined) {
    return Object.entries(def.shape).flatMap(([key, field]) => collect(field, [...prefix, key]));
  }
  return [];
};

/**
 * Paths of every ISO date-time field (`IsoDateTimeSchema`) in an object schema,
 * through optional/nullable/default wrappers, nested objects and arrays.
 * Unions and records are not walked: Firestore entities keep timestamps in
 * plain fields.
 */
export const listDateTimePaths = (schema: z.core.$ZodType): FieldPath[] =>
  unwrap(schema).type === "object" ? collect(schema, []) : [];

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const mapAtPath = (value: unknown, path: FieldPath, fn: (leaf: unknown) => unknown): unknown => {
  const [head, ...rest] = path;
  if (head === undefined) return fn(value);
  if (head === "[]") return Array.isArray(value) ? value.map((item: unknown) => mapAtPath(item, rest, fn)) : value;
  if (!isPlainRecord(value) || !(head in value)) return value;
  return { ...value, [head]: mapAtPath(value[head], rest, fn) };
};

/**
 * Returns a copy of `value` with `fn` applied to the leaf at each path.
 * Missing keys stay missing; shapes that do not match a path are left as is.
 */
export const mapAtPaths = <T>(value: T, paths: readonly FieldPath[], fn: (leaf: unknown) => unknown): T =>
  // Only leaves at known paths change, so the shape of T is preserved.
  paths.reduce<unknown>((current, path) => mapAtPath(current, path, fn), value) as T;
