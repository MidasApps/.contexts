import { z } from "zod";

/** Spec §16.4: field-level `pii` is authoritative; `sensitive` never reaches a model. */
export const PiiLevelSchema = z.enum(["none", "personal", "sensitive"]);
export type PiiLevel = z.infer<typeof PiiLevelSchema>;

export const ContractKindSchema = z.enum(["entity", "command", "query", "event", "settings", "ui-component", "view"]);
export type ContractKind = z.infer<typeof ContractKindSchema>;

/** Tenancy levels of spec §4 (organization → project → unit), plus platform-wide and per-user data. */
export const TenancyScopeSchema = z.enum(["platform", "organization", "project", "unit", "user"]);
export type TenancyScope = z.infer<typeof TenancyScopeSchema>;

/** `<context>.<Name>`, e.g. `tenancy.Organization`; a breaking change becomes `<context>.<Name>V2`. */
export const ContractIdSchema = z.string().regex(/^[a-z][a-z0-9-]*\.[A-Z][A-Za-z0-9]*$/, {
  error: "Expected <context>.<Name>, e.g. tenancy.Organization.",
});
export type ContractId = z.infer<typeof ContractIdSchema>;

/** Permission format of spec §4: `<module>.<resource>.<action>`. */
export const PermissionSchema = z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, {
  error: "Expected <module>.<resource>.<action>.",
});
export type Permission = z.infer<typeof PermissionSchema>;

export const RelationSchema = z.strictObject({
  target: ContractIdSchema,
  type: z.enum(["belongs-to", "has-one", "has-many", "references"]),
  /** Field that holds the reference: in this contract for belongs-to/references, in the target for has-*. */
  field: z.string().min(1),
});
export type Relation = z.infer<typeof RelationSchema>;

export const UiMetaSchema = z.strictObject({
  widget: z.string().min(1).optional(),
  labelKey: z.string().min(1).optional(),
  order: z.int().nonnegative().optional(),
  group: z.string().min(1).optional(),
  /** Hidden unless the viewer holds this permission. */
  visibleWith: PermissionSchema.optional(),
});
export type UiMeta = z.infer<typeof UiMetaSchema>;

/** Metadata of every exported contract (spec §5 and §16.4). */
export const CatalogMetaSchema = z.strictObject({
  id: ContractIdSchema,
  kind: ContractKindSchema,
  description: z.string().min(1),
  examples: z.array(z.unknown()).min(1),
  pii: PiiLevelSchema,
  tenancyScope: TenancyScopeSchema,
  relations: z.array(RelationSchema),
  ui: UiMetaSchema.optional(),
  permission: PermissionSchema.optional(),
  deprecated: z.boolean().optional(),
});
export type CatalogMeta = z.infer<typeof CatalogMetaSchema>;

/** Metadata of every top-level field of a contract. */
export const FieldMetaSchema = z.strictObject({
  description: z.string().min(1),
  pii: PiiLevelSchema,
  ui: UiMetaSchema.optional(),
  examples: z.array(z.unknown()).min(1).optional(),
  deprecated: z.boolean().optional(),
});
export type FieldMeta = z.infer<typeof FieldMetaSchema>;

/** Meta keys that are not JSON Schema keywords; generated artifacts carry them only as `x-<key>`. */
export const CUSTOM_META_KEYS = ["kind", "pii", "tenancyScope", "relations", "ui", "permission"] as const;
