import type { Permission, RoleId, RoleRef, TenantId } from "@core/contracts";
import type { CustomRoleRecord } from "./grant.ts";
import type { PermissionRegistry } from "./permission-registry.ts";

export type ResolvedRolePermissions = {
  readonly permissions: ReadonlySet<Permission>;
  /** Custom roles that are missing, deleted or of another tenant. */
  readonly unknownRoleIds: readonly RoleId[];
};

/** Custom role ids named by a list of role refs, de-duplicated. */
export const customRoleIdsOf = (roles: readonly RoleRef[]): RoleId[] => [
  ...new Set(roles.flatMap((role) => (role.kind === "custom" ? [role.roleId] : []))),
];

/**
 * Permissions a set of role refs grants in a tenant (escalation checks, SP1 spec §5.3):
 * system roles from the registry, custom roles from their live records. Pure.
 */
export const resolveRolePermissions = (args: {
  roles: readonly RoleRef[];
  customRoles: readonly CustomRoleRecord[];
  tenantId: TenantId;
  registry: PermissionRegistry;
}): ResolvedRolePermissions => {
  const live = new Map(
    args.customRoles
      .filter((role) => !role.isDeleted && role.tenantId === args.tenantId)
      .map((role) => [role.id, role]),
  );
  const permissions = new Set<Permission>();
  const unknownRoleIds: RoleId[] = [];
  for (const role of args.roles) {
    if (role.kind === "system") {
      for (const permission of args.registry.permissionsForSystemRole(role.key)) permissions.add(permission);
      continue;
    }
    const record = live.get(role.roleId);
    if (record === undefined) unknownRoleIds.push(role.roleId);
    for (const id of record?.permissions ?? []) {
      if (args.registry.get(id)?.scope === "tenant") permissions.add(id);
    }
  }
  return { permissions, unknownRoleIds };
};

/** Permission ids that are not registered tenant permissions (422 UNKNOWN_PERMISSION). */
export const unknownTenantPermissions = (ids: readonly string[], registry: PermissionRegistry): string[] =>
  [...new Set(ids)].filter((id) => registry.get(id)?.scope !== "tenant").sort();

/** Whether a role list holds the system `owner` role. */
export const holdsOwner = (roles: readonly RoleRef[]): boolean =>
  roles.some((role) => role.kind === "system" && role.key === "owner");
