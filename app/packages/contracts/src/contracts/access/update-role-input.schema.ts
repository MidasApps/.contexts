import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { HAS_ANY_FIELD_ERROR, hasAnyField } from "../primitives/refinements.ts";
import { RoleDescriptionSchema, RoleNameSchema, rolePermissionsField } from "./role.schema.ts";

export const UpdateRoleInputSchema = z
  .strictObject({
    name: RoleNameSchema.optional().meta(none("New display name.")),
    description: RoleDescriptionSchema.optional().meta(none("New description.")),
    permissions: rolePermissionsField("New permission set; replaces the old one.").optional(),
  })
  .refine(hasAnyField, HAS_ANY_FIELD_ERROR);
export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>;

export const UpdateRoleInputContract = defineContract(UpdateRoleInputSchema, {
  id: "access.UpdateRoleInput",
  kind: "command",
  description: "Changes a custom role (core.role.update); every holder's access changes with it.",
  examples: [{ name: "Project maintainer" }, { permissions: ["core.project.read", "core.unit.read"] }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.role.update",
});
