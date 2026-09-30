import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { UnitIdSchema } from "./ids.schema.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { NodeRegionalOverridesSchema } from "./regional-defaults.schema.ts";
import { UnitTypeIdSchema } from "./unit-type.schema.ts";

export const CreateUnitInputSchema = z.strictObject({
  name: NodeNameSchema.meta(none("Display name of the new unit.")),
  type: UnitTypeIdSchema.meta(none("Registered unit type; it must allow the parent.")),
  parentUnitId: UnitIdSchema.nullable()
    .default(null)
    .meta(none("Parent unit in the same project; null (default) creates it directly under the project.")),
  settings: z
    .strictObject(NodeRegionalOverridesSchema.shape)
    .optional()
    .meta(none("Regional overrides; absent fields inherit from the parent node.")),
});
export type CreateUnitInput = z.infer<typeof CreateUnitInputSchema>;

export const CreateUnitInputContract = defineContract(CreateUnitInputSchema, {
  id: "tenancy.CreateUnitInput",
  kind: "command",
  description: "Creates a unit under a project or unit (`core.unit.create` at the parent; depth limit 6).",
  examples: [
    { name: "North site", type: "sample.site", parentUnitId: null },
    { name: "Room 101", type: "sample.room", parentUnitId: EXAMPLE_IDS.unitRoot, settings: { currency: "USD" } },
  ],
  pii: "none",
  tenancyScope: "project",
  relations: [],
  permission: "core.unit.create",
});
