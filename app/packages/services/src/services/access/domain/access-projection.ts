import type { AccessProjection, GrantPrincipalType, ProjectId, TenantId, TenantNodeRef, UnitId } from "@core/contracts";

/** The principal a projection belongs to (users and devices hold grants). */
export type ProjectionPrincipal = { readonly type: GrantPrincipalType; readonly id: string };

/** The projection fields derived from grants; `id`, `version` and `updatedAt` are added by the writer. */
export type AccessProjectionState = Omit<AccessProjection, "id" | "version" | "updatedAt">;

const sortedUnique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort();

/**
 * Builds the access projection of one principal in one tenant from its live grants
 * (SP1 spec §5.4). Pure; grants of other tenants are ignored.
 * @param organizationDeleted a deleted organization revokes every projection.
 * @example buildAccessProjection({ tenantId, principal: { type: "user", id: uid }, grants: memberships.map((m) => m.node) })
 */
export const buildAccessProjection = (args: {
  tenantId: TenantId;
  principal: ProjectionPrincipal;
  grants: readonly TenantNodeRef[];
  organizationDeleted?: boolean;
}): AccessProjectionState => {
  const grants = args.grants.filter((node) => node.tenantId === args.tenantId);
  const projectIds: ProjectId[] = [];
  const unitIds: UnitId[] = [];
  const visible: ProjectId[] = [];
  for (const node of grants) {
    if (node.level === "project") projectIds.push(node.projectId);
    if (node.level === "unit") unitIds.push(node.unitId);
    if (node.level !== "organization") visible.push(node.projectId);
  }
  return {
    tenantId: args.tenantId,
    principalId: args.principal.id,
    principalType: args.principal.type,
    orgWide: grants.some((node) => node.level === "organization"),
    projectIds: sortedUnique(projectIds),
    unitIds: sortedUnique(unitIds),
    visibleProjectIds: sortedUnique(visible),
    isRevoked: grants.length === 0 || args.organizationDeleted === true,
  };
};

/** Id of the node a grant sits on: the tenant, the project or the unit. */
export const nodeIdOf = (node: TenantNodeRef): string =>
  node.level === "organization" ? node.tenantId : node.level === "project" ? node.projectId : node.unitId;
