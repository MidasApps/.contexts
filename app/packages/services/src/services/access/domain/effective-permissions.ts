import type { Permission, RoleRef } from "@core/contracts";
import type { GrantSource } from "./authorization.ts";
import type { CustomRoleRecord, GrantRecord } from "./grant.ts";
import { chainNodeIds, type NodeChain } from "./node-chain.ts";
import type { PermissionRegistry } from "./permission-registry.ts";

export type EffectivePermissions = {
  readonly permissions: ReadonlySet<Permission>;
  /** For each permission, the grants that gave it (for `grantedVia` and audits). */
  readonly sources: ReadonlyMap<Permission, readonly GrantSource[]>;
};

type RolePermissionsResolver = (role: RoleRef) => readonly Permission[];

// Custom roles: deleted ones, other tenants' ones and unregistered or platform
// permission ids grant nothing (SP1 spec §5.2 step 4).
const makeRoleResolver = (args: {
  customRoles: readonly CustomRoleRecord[];
  registry: PermissionRegistry;
  tenantId: string;
}): RolePermissionsResolver => {
  const live = new Map(
    args.customRoles
      .filter((role) => !role.isDeleted && role.tenantId === args.tenantId)
      .map((role) => [role.id, role] as const),
  );
  return (role) => {
    if (role.kind === "system") return [...args.registry.permissionsForSystemRole(role.key)];
    const permissions = live.get(role.roleId)?.permissions ?? [];
    return permissions.filter((id) => args.registry.get(id)?.scope === "tenant");
  };
};

const addSource = (sources: Map<Permission, GrantSource[]>, permission: Permission, source: GrantSource): void => {
  const existing = sources.get(permission);
  if (existing === undefined) sources.set(permission, [source]);
  else if (!existing.includes(source)) existing.push(source);
};

/**
 * Effective tenant permissions of a principal at a node: the union of the roles of
 * every live grant on the node chain (grants inherit downwards), optionally
 * intersected with an agent ceiling. Pure; the caller loads grants and roles.
 */
export const computeEffectivePermissions = (args: {
  grants: readonly GrantRecord[];
  chain: NodeChain;
  customRoles: readonly CustomRoleRecord[];
  registry: PermissionRegistry;
  ceiling?: ReadonlySet<Permission> | undefined;
}): EffectivePermissions => {
  const tenantId = args.chain.organization.id;
  const onChain = new Set(chainNodeIds(args.chain));
  const resolve = makeRoleResolver({ customRoles: args.customRoles, registry: args.registry, tenantId });
  const sources = new Map<Permission, GrantSource[]>();
  for (const grant of args.grants) {
    if (grant.isDeleted || grant.tenantId !== tenantId || !onChain.has(grant.nodeId)) continue;
    const source: GrantSource = {
      kind: "membership",
      membershipId: grant.membershipId,
      nodeId: grant.nodeId,
      roles: grant.roles,
    };
    for (const role of grant.roles) {
      for (const permission of resolve(role)) {
        if (args.ceiling === undefined || args.ceiling.has(permission)) addSource(sources, permission, source);
      }
    }
  }
  return { permissions: new Set(sources.keys()), sources };
};
