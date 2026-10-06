import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { ProjectIdSchema, UnitIdSchema } from "./ids.schema.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { NodeRegionalOverridesSchema } from "./regional-defaults.schema.ts";
import { UnitTypeIdSchema } from "./unit-type.schema.ts";

/** Depth of a unit = number of its ancestors: a unit directly under the project has depth 0. */
export const MAX_UNIT_DEPTH = 6;

/** The unit fields without the tree refinement; nest them with `z.object(UnitFieldsSchema.shape)`. */
export const UnitFieldsSchema = z.object({
  id: UnitIdSchema.meta(none("Automatic id of the unit.")),
  tenantId: TenantIdSchema.meta(none("Organization that owns the unit.")),
  projectId: ProjectIdSchema.meta(none("Project the unit tree belongs to.")),
  parentUnitId: UnitIdSchema.nullable().meta(none("Parent unit; null when the unit sits directly under the project.")),
  ancestorIds: z
    .array(UnitIdSchema)
    .max(MAX_UNIT_DEPTH)
    .meta(none("Ids of every ancestor unit, root first; length equals depth.")),
  depth: z
    .int()
    .min(0)
    .max(MAX_UNIT_DEPTH)
    .meta(none(`Number of ancestors, 0-${MAX_UNIT_DEPTH}.`)),
  type: UnitTypeIdSchema.meta(none("Registered unit type, `<module>.<type>`.")),
  name: NodeNameSchema.meta(none("Display name of the unit.")),
  settings: z.object(NodeRegionalOverridesSchema.shape).meta(none("Regional overrides of the unit.")),
  createdAt: IsoDateTimeSchema.meta(none("When the unit was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the unit last changed (UTC).")),
});

type UnitFields = z.infer<typeof UnitFieldsSchema>;

// Tree invariants (SP1 spec §4): `authorize()` and the Security Rules trust ancestorIds.
const checkTreeFields = (unit: UnitFields, ctx: z.RefinementCtx): void => {
  if (unit.ancestorIds.length !== unit.depth) {
    ctx.addIssue({ code: "custom", path: ["ancestorIds"], message: "ancestorIds must have exactly depth entries." });
  }
  if (unit.parentUnitId !== (unit.ancestorIds.at(-1) ?? null)) {
    ctx.addIssue({ code: "custom", path: ["parentUnitId"], message: "parentUnitId must be the last ancestor." });
  }
  if (new Set([...unit.ancestorIds, unit.id]).size !== unit.ancestorIds.length + 1) {
    ctx.addIssue({
      code: "custom",
      path: ["ancestorIds"],
      message: "ancestorIds must be unique and exclude the unit.",
    });
  }
};

export const UnitSchema = UnitFieldsSchema.superRefine(checkTreeFields);
export type Unit = z.infer<typeof UnitSchema>;

export const UNIT_EXAMPLE = {
  id: EXAMPLE_IDS.unit,
  tenantId: EXAMPLE_IDS.organization,
  projectId: EXAMPLE_IDS.project,
  parentUnitId: EXAMPLE_IDS.unitRoot,
  ancestorIds: [EXAMPLE_IDS.unitRoot],
  depth: 1,
  type: "sample.room",
  name: "Room 101",
  settings: {},
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.updated,
} as const;

export const UnitContract = defineContract(UnitSchema, {
  id: "tenancy.Unit",
  kind: "entity",
  description: `A node of a project's unit tree, typed by an application module (depth 0-${MAX_UNIT_DEPTH}).`,
  examples: [UNIT_EXAMPLE],
  pii: "none",
  tenancyScope: "unit",
  relations: [
    { target: "tenancy.Organization", type: "belongs-to", field: "tenantId" },
    { target: "tenancy.Project", type: "belongs-to", field: "projectId" },
    { target: "tenancy.Unit", type: "belongs-to", field: "parentUnitId" },
  ],
  permission: "core.unit.read",
});
