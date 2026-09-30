import type { Permission, Principal, RoleRef, TenantNodeRef } from "@core/contracts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import type { RequestAccess } from "../composition.ts";
import { AccessDeniedError } from "../domain/errors/access-denied-error.ts";
import { EscalationForbiddenError } from "../domain/errors/escalation-forbidden-error.ts";
import { UnknownRoleError } from "../domain/errors/unknown-role-error.ts";
import { assertNoEscalation } from "../domain/escalation-guard.ts";
import { customRoleIdsOf, resolveRolePermissions } from "../domain/role-permissions.ts";
import type { AccessWriteDeps } from "./access-write-deps.ts";

/**
 * Authorizes `permission` at `node` for the actor (fail-closed).
 * @returns `AccessDeniedError` with the deny reason, for `deniedResponse`.
 */
export const requirePermission = async (args: {
  access: RequestAccess;
  actor: Principal;
  permission: Permission;
  node: TenantNodeRef;
}): Promise<Result<void, AccessDeniedError>> => {
  const decision = await args.access.authorize({ principal: args.actor, permission: args.permission, node: args.node });
  return decision.allowed ? ok(undefined) : err(new AccessDeniedError(decision.reason));
};

/** No escalation (SP1 spec §5.3): `requested ⊆ effective(actor, node)`. */
export const requireNoEscalation = async (args: {
  access: RequestAccess;
  actor: Principal;
  node: TenantNodeRef;
  requested: Iterable<Permission>;
}): Promise<Result<void, AccessDeniedError | EscalationForbiddenError>> => {
  const effective = await args.access.getEffectivePermissions({ principal: args.actor, node: args.node });
  if (!effective.ok) return err(new AccessDeniedError(effective.reason));
  const check = assertNoEscalation({ requested: args.requested, actorEffective: effective.permissions });
  return check.ok ? ok(undefined) : err(new EscalationForbiddenError(check.missing));
};

export type GrantCheckError = AccessDeniedError | EscalationForbiddenError | UnknownRoleError;

/**
 * Owner hierarchy (decision 0030 §6): changing, revoking or removing an existing grant
 * requires the grant's current permissions ⊆ effective(actor, grant node), so an admin
 * cannot demote or remove an owner. Custom roles deleted since do not count.
 */
export const requireWithinActor = async (
  deps: Pick<AccessWriteDeps, "registry" | "roleReader">,
  args: { access: RequestAccess; actor: Principal; grants: readonly { readonly node: TenantNodeRef; readonly roles: readonly RoleRef[] }[] },
): Promise<Result<void, AccessDeniedError | EscalationForbiddenError>> => {
  for (const grant of args.grants) {
    const roleIds = customRoleIdsOf(grant.roles);
    const customRoles = roleIds.length === 0 ? [] : await deps.roleReader.getRoles({ tenantId: grant.node.tenantId, roleIds });
    const held = resolveRolePermissions({ roles: grant.roles, customRoles, tenantId: grant.node.tenantId, registry: deps.registry });
    const within = await requireNoEscalation({ access: args.access, actor: args.actor, node: grant.node, requested: held.permissions });
    if (!within.ok) return within;
  }
  return ok(undefined);
};

/**
 * Checks that the actor may grant `roles` at `node`: `permission` there, every custom
 * role live in the node's tenant, and the roles' permissions within the actor's own.
 */
export const checkGrantable = async (
  deps: Pick<AccessWriteDeps, "registry" | "roleReader">,
  args: { access: RequestAccess; actor: Principal; permission: Permission; node: TenantNodeRef; roles: readonly RoleRef[] },
): Promise<Result<void, GrantCheckError>> => {
  const allowed = await requirePermission(args);
  if (!allowed.ok) return allowed;
  const roleIds = customRoleIdsOf(args.roles);
  const customRoles = roleIds.length === 0 ? [] : await deps.roleReader.getRoles({ tenantId: args.node.tenantId, roleIds });
  const resolved = resolveRolePermissions({ roles: args.roles, customRoles, tenantId: args.node.tenantId, registry: deps.registry });
  if (resolved.unknownRoleIds.length > 0) return err(new UnknownRoleError(resolved.unknownRoleIds));
  return requireNoEscalation({ ...args, requested: resolved.permissions });
};
