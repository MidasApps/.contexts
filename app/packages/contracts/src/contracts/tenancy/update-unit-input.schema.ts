import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { HAS_ANY_FIELD_ERROR, hasAnyField } from "../primitives/refinements.ts";
import { UnitIdSchema } from "./ids.schema.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { NodeRegionalOverridesPatchSchema } from "./update-project-input.schema.ts";

export const UpdateUnitInputSchema = z
  .strictObject({
    name: NodeNameSchema.optional().meta(none("New display name.")),
    parentUnitId: UnitIdSchema.nullable()
      .optional()
      .meta(none("Moves the unit inside its project: a unit id, or null for directly under the project.")),
    settings: NodeRegionalOverridesPatchSchema.optional().meta(none("Regional override changes.")),
  })
  .refine(hasAnyField, HAS_ANY_FIELD_ERROR);
export type UpdateUnitInput = z.infer<typeof UpdateUnitInputSchema>;

export const UpdateUnitInputContract = defineContract(UpdateUnitInputSchema, {
  id: "tenancy.UpdateUnitInput",
  kind: "command",
  description: "Renames or moves a unit (`core.unit.update`); a move rewrites at most 500 descendants.",
  examples: [{ name: "Room 102" }, { parentUnitId: EXAMPLE_IDS.unitRoot }, { parentUnitId: null }],
  pii: "none",
  tenancyScope: "unit",
  relations: [],
  permission: "core.unit.update",
});
