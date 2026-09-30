import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";

/** `<module>.<type>`, e.g. `sample.site`; declared by module manifests (SP1 spec §4). */
export const UnitTypeIdSchema = z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, {
  error: "Expected <module>.<type>, e.g. sample.site.",
});
export type UnitTypeId = z.infer<typeof UnitTypeIdSchema>;

/** A unit may sit directly under the project or under a unit of an allowed type. */
export const UnitParentKindSchema = z.union([z.literal("project"), UnitTypeIdSchema]);
export type UnitParentKind = z.infer<typeof UnitParentKindSchema>;

export const UnitTypeDefinitionSchema = z.object({
  id: UnitTypeIdSchema.meta(none("Unit type id, `<module>.<type>`.")),
  labelKey: z.string().min(1).meta(none("i18n key of the type label.")),
  allowedParents: z
    .array(UnitParentKindSchema)
    .min(1)
    .meta(none("Where a unit of this type may be created: `project` or other unit type ids.")),
});
export type UnitTypeDefinition = z.infer<typeof UnitTypeDefinitionSchema>;

export const UnitTypeDefinitionContract = defineContract(UnitTypeDefinitionSchema, {
  id: "tenancy.UnitTypeDefinition",
  kind: "view",
  description: "A unit type registered by an application module; the core registers none.",
  examples: [
    { id: "sample.site", labelKey: "sample.unitTypes.site", allowedParents: ["project"] },
    { id: "sample.room", labelKey: "sample.unitTypes.room", allowedParents: ["sample.site", "sample.room"] },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
});
