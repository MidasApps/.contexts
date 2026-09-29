import type { z } from "zod";
import { FieldMetaSchema, type FieldMeta } from "./primitives/catalog-meta.schema.ts";

export type ZodMetaRegistry = z.core.$ZodRegistry<z.core.GlobalMeta>;

type WrapperDef = { innerType?: z.core.$ZodType };

/**
 * Meta may sit on the field or on the schema it wraps (`z.string().meta(m).optional()`),
 * so walk optional/nullable/default/readonly wrappers until a meta entry is found.
 */
export const readRawFieldMeta = (
  field: z.core.$ZodType,
  registry: ZodMetaRegistry,
): Record<string, unknown> | undefined => {
  let current: z.core.$ZodType | undefined = field;
  while (current !== undefined) {
    const meta = registry.get(current);
    if (meta !== undefined) return meta;
    current = (current._zod.def as WrapperDef).innerType;
  }
  return undefined;
};

export const readFieldMeta = (field: z.core.$ZodType, registry: ZodMetaRegistry): FieldMeta | undefined => {
  const parsed = FieldMetaSchema.safeParse(readRawFieldMeta(field, registry));
  return parsed.success ? parsed.data : undefined;
};

/** Top-level fields of an object contract; non-object contracts have none. */
export const listTopLevelFields = (schema: z.core.$ZodType): [string, z.core.$ZodType][] =>
  schema._zod.def.type === "object" ? Object.entries((schema._zod.def as z.core.$ZodObjectDef).shape) : [];

export const isFieldOptional = (field: z.core.$ZodType): boolean => field._zod.optin === "optional";
