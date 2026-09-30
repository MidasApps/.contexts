import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { HAS_ANY_FIELD_ERROR, hasAnyField } from "../primitives/refinements.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { RegionalDefaultsSchema } from "./regional-defaults.schema.ts";

export const UpdateOrganizationInputSchema = z
  .strictObject({
    name: NodeNameSchema.optional().meta(none("New display name.")),
    defaults: z
      .strictObject(RegionalDefaultsSchema.shape)
      .partial()
      .optional()
      .meta(none("Regional defaults to change; absent keys keep their value.")),
  })
  .refine(hasAnyField, HAS_ANY_FIELD_ERROR);
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationInputSchema>;

export const UpdateOrganizationInputContract = defineContract(UpdateOrganizationInputSchema, {
  id: "tenancy.UpdateOrganizationInput",
  kind: "command",
  description: "Changes the name or regional defaults of an organization (`core.organization.update`).",
  examples: [{ name: "Northwind Brasil" }, { defaults: { timeZone: "America/Recife" } }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.organization.update",
});
