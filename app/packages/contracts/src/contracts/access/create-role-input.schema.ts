import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { ROLE_EXAMPLE, RoleDescriptionSchema, RoleNameSchema, rolePermissionsField } from "./role.schema.ts";

export const CreateRoleInputSchema = z.strictObject({
  name: RoleNameSchema.meta(none("Display name of the role.")),
  description: RoleDescriptionSchema.default("").meta(none("What the role is for.")),
  permissions: rolePermissionsField("Tenant permissions to grant; each must be held by the caller (no escalation)."),
});
export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>;

export const CreateRoleInputContract = defineContract(CreateRoleInputSchema, {
  id: "access.CreateRoleInput",
  kind: "command",
  description: "Creates a custom role (core.role.create); unknown permissions answer 422 UNKNOWN_PERMISSION.",
  examples: [{ name: ROLE_EXAMPLE.name, description: ROLE_EXAMPLE.description, permissions: ROLE_EXAMPLE.permissions }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.role.create",
});
