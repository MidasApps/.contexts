import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { PLATFORM_ROLES, PlatformRoleSchema } from "../identity/platform-staff.schema.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { SystemRoleKeySchema } from "./system-roles.ts";

export const PermissionKindSchema = z.enum(["read", "write"]);
export type PermissionKind = z.infer<typeof PermissionKindSchema>;

export const PermissionScopeSchema = z.enum(["tenant", "platform"]);
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

const PLATFORM_PREFIX = "platform.";
const PLATFORM_ROLE_SET: ReadonlySet<string> = new Set(PLATFORM_ROLES);

const PermissionDefinitionFieldsSchema = z.object({
  id: PermissionSchema.meta(none("Permission id, `<module>.<resource>.<action>`.")),
  descriptionKey: z.string().min(1).meta(none("i18n key describing the permission.")),
  kind: PermissionKindSchema.meta(none("`read` or `write`; impersonation may only use `read`.")),
  scope: PermissionScopeSchema.meta(none("`tenant` (checked at organization/project/unit) or `platform` (staff).")),
  requiresApproval: z.boolean().optional().meta(none("Actions under this permission need a four-eyes approval.")),
  defaultRoles: z
    .array(z.union([SystemRoleKeySchema, PlatformRoleSchema]))
    .meta(none("System roles (tenant) or staff roles (platform) that hold it by default.")),
});

type PermissionDefinitionFields = z.infer<typeof PermissionDefinitionFieldsSchema>;

// Scope rules of SP1 spec §5.1: `platform.*` ids are platform-scoped with staff roles only.
const checkScope = (definition: PermissionDefinitionFields, ctx: z.RefinementCtx): void => {
  const isPlatform = definition.scope === "platform";
  if (definition.id.startsWith(PLATFORM_PREFIX) !== isPlatform) {
    ctx.addIssue({
      code: "custom",
      path: ["id"],
      message: "Only platform-scoped permissions use the `platform.` prefix.",
    });
  }
  const mismatched = definition.defaultRoles.filter((role) => PLATFORM_ROLE_SET.has(role) !== isPlatform);
  if (mismatched.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["defaultRoles"],
      message: `Roles do not match the ${definition.scope} scope.`,
    });
  }
};

/** A permission declared as data (core catalog or a module manifest). */
export const PermissionDefinitionSchema = PermissionDefinitionFieldsSchema.superRefine(checkScope);
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>;

export const PermissionDefinitionContract = defineContract(PermissionDefinitionSchema, {
  id: "access.PermissionDefinition",
  kind: "view",
  description: "A registered permission with its kind, scope and default roles (GET /v1/permissions).",
  examples: [
    {
      id: "core.project.read",
      descriptionKey: "permissions.core.project.read",
      kind: "read",
      scope: "tenant",
      defaultRoles: ["owner", "admin", "member", "viewer"],
    },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
});
