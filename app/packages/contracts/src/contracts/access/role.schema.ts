import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { hasUniqueItems } from "../primitives/refinements.ts";
import { RoleIdSchema } from "./role-ref.schema.ts";

/** A custom role holds at most 200 registered permissions (SP1 spec §4). */
export const MAX_ROLE_PERMISSIONS = 200;

export const RoleNameSchema = z.string().trim().min(1).max(80);
export const RoleDescriptionSchema = z.string().trim().max(500);

/** 1-200 distinct permission ids; the server rejects unregistered ones with 422 UNKNOWN_PERMISSION. */
export const rolePermissionsField = (description: string) =>
  z
    .array(PermissionSchema)
    .min(1)
    .max(MAX_ROLE_PERMISSIONS)
    .refine(hasUniqueItems, { error: "Permissions must be distinct." })
    .meta(none(description));

export const RoleSchema = z.object({
  id: RoleIdSchema.meta(none("Automatic id of the custom role.")),
  tenantId: TenantIdSchema.meta(none("Organization that owns the role.")),
  name: RoleNameSchema.meta(none("Display name of the role.")),
  description: RoleDescriptionSchema.meta(none("What the role is for; may be empty.")),
  permissions: rolePermissionsField("Tenant permissions the role grants."),
  createdAt: IsoDateTimeSchema.meta(none("When the role was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the role last changed (UTC).")),
});
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_EXAMPLE = {
  id: EXAMPLE_IDS.role,
  tenantId: EXAMPLE_IDS.organization,
  name: "Project editor",
  description: "Edits projects and units, cannot manage members.",
  permissions: ["core.project.read", "core.project.update", "core.unit.read", "core.unit.create", "core.unit.update"],
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.updated,
} as const;

export const RoleContract = defineContract(RoleSchema, {
  id: "access.Role",
  kind: "entity",
  description: "A custom role of an organization: a named set of tenant permissions.",
  examples: [ROLE_EXAMPLE],
  pii: "none",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.role.read",
});
