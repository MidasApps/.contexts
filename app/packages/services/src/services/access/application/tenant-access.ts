import type { Permission, Principal, RoleId, TenantNodeRef } from "@core/contracts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { DenyReason } from "../domain/authorization.ts";
import { computeEffectivePermissions, type EffectivePermissions } from "../domain/effective-permissions.ts";
import type { GrantRecord } from "../domain/grant.ts";
import { chainNodeIds, checkNodeChain } from "../domain/node-chain.ts";
import type { PermissionRegistry } from "../domain/permission-registry.ts";
import type { AccessReaders } from "./ports/driven/access-readers.ts";
import { resolveTenantSubject, type TenantSubject } from "./principal-subject.ts";

/** What the access use cases need; built per request by `createAccessCore().forRequest()`. */
export type AccessDeps = {
  readonly registry: PermissionRegistry;
  readonly readers: AccessReaders;
  readonly clock: Clock;
};

export type TenantAccess =
  | { readonly ok: true; readonly subject: TenantSubject; readonly effective: EffectivePermissions }
  | { readonly ok: false; readonly reason: DenyReason };

const deniedAccess = (reason: DenyReason): TenantAccess => ({ ok: false, reason });

const customRoleIds = (grants: readonly GrantRecord[]): RoleId[] => [
  ...new Set(grants.flatMap((grant) => grant.roles.flatMap((role) => (role.kind === "custom" ? [role.roleId] : [])))),
];

/**
 * Steps 2-4 of `authorize()` (SP1 spec §5.2): load and check the node chain,
 * resolve the principal to its subject, then read its grants and roles.
 * @param precheck permission-specific limits of the subject, checked before any grant read.
 */
export const loadTenantAccess = async (args: {
  principal: Principal;
  node: TenantNodeRef;
  deps: AccessDeps;
  precheck?: (subject: TenantSubject) => DenyReason | null;
}): Promise<TenantAccess> => {
  const { principal, node, deps } = args;
  const chain = await deps.readers.nodeChains.loadChain(node);
  if (chain === null) return deniedAccess("NODE_NOT_FOUND");
  const chainIssue = checkNodeChain(node, chain);
  if (chainIssue !== null) return deniedAccess(chainIssue);
  const resolved = await resolveTenantSubject(principal, {
    node,
    chain,
    readers: deps.readers,
    clock: deps.clock,
    registry: deps.registry,
  });
  if (!resolved.ok) return resolved;
  const precheckIssue = args.precheck?.(resolved.subject) ?? null;
  if (precheckIssue !== null) return deniedAccess(precheckIssue);
  const nodeIds = chainNodeIds(chain);
  const grants = await deps.readers.grants.listGrants({
    tenantId: node.tenantId,
    principalId: resolved.subject.principalId,
    nodeIds,
  });
  const live = grants.filter(
    (grant) => !grant.isDeleted && grant.tenantId === node.tenantId && nodeIds.includes(grant.nodeId),
  );
  if (live.length === 0) return deniedAccess("NOT_A_MEMBER");
  const roleIds = customRoleIds(live);
  const customRoles =
    roleIds.length === 0 ? [] : await deps.readers.roles.getRoles({ tenantId: node.tenantId, roleIds });
  return {
    ok: true,
    subject: resolved.subject,
    effective: computeEffectivePermissions({ grants: live, chain, customRoles, registry: deps.registry }),
  };
};

/** Applies the subject's limits: API key scopes, and `read` only under impersonation. */
export const limitToSubject = (args: {
  permissions: ReadonlySet<Permission>;
  subject: TenantSubject;
  registry: PermissionRegistry;
}): ReadonlySet<Permission> => {
  const { subject, registry } = args;
  return new Set(
    [...args.permissions].filter(
      (permission) =>
        (subject.scopes?.has(permission) ?? true) && (!subject.readOnly || registry.get(permission)?.kind === "read"),
    ),
  );
};
