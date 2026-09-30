import { roleRefKey, type Membership, type MyGrant, type RoleRef, type TenantId, type TenantNodeRef, type UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import type { RequestAccess } from "../composition.ts";
import { nodeIdOf } from "../domain/access-projection.ts";
import type { DenyReason } from "../domain/authorization.ts";
import { AccessDeniedError } from "../domain/errors/access-denied-error.ts";
import type { MembershipRepository } from "./ports/driven/membership-repository.ts";

/** Bounds the reads of one check; a member rarely holds this many grants in one organization. */
export const MAX_MEMBERSHIP_NODES_CHECKED = 50;

export const LEVEL_ORDER: Record<TenantNodeRef["level"], number> = { organization: 0, project: 1, unit: 2 };

type Deps = { readonly memberships: Pick<MembershipRepository, "listOfPrincipals"> };
type MemberArgs = { access: RequestAccess; actor: UserPrincipal; tenantId: TenantId };

const nodeKey = (node: TenantNodeRef): string => `${node.level}:${nodeIdOf(node)}`;

const mergeRoles = (left: readonly RoleRef[], right: readonly RoleRef[]): RoleRef[] => {
  const byKey = new Map([...left, ...right].map((role) => [roleRefKey(role), role]));
  return [...byKey.values()];
};

// Distinct grant nodes with their merged roles, organization first: the cheapest chain and
// the widest grant decide first.
const grantNodesOf = (grants: readonly Membership[], tenantId: TenantId): MyGrant[] => {
  const byNode = new Map<string, MyGrant>();
  for (const grant of grants) {
    if (grant.principalType !== "user" || grant.node.tenantId !== tenantId) continue;
    const current = byNode.get(nodeKey(grant.node));
    byNode.set(nodeKey(grant.node), { node: grant.node, roles: mergeRoles(current?.roles ?? [], grant.roles) });
  }
  return [...byNode.values()].sort((left, right) => LEVEL_ORDER[left.node.level] - LEVEL_ORDER[right.node.level]).slice(0, MAX_MEMBERSHIP_NODES_CHECKED);
};

const readGrantNodes = async (deps: Deps, args: MemberArgs): Promise<MyGrant[]> =>
  grantNodesOf(await deps.memberships.listOfPrincipals({ tenantId: args.tenantId, principalIds: [args.actor.uid] }), args.tenantId);

/**
 * Whether the user is a live member of the organization (decision 0030 A5): it holds at least
 * one live grant, anywhere in the organization's tree, on a node `getEffectivePermissions`
 * accepts (live node chain, active organization, active user). Grants come from the source of
 * truth (`memberships`), never from the access projection. It grants nothing: the member still
 * reads only what its grants allow. Fail-closed: a reader error rejects.
 * @returns `NOT_A_MEMBER` without any live grant, otherwise the first node's deny reason.
 */
export const requireOrganizationMember = async (deps: Deps, args: MemberArgs): Promise<Result<void, AccessDeniedError>> => {
  const nodes = await readGrantNodes(deps, args);
  let firstReason: DenyReason = "NOT_A_MEMBER";
  for (const [index, { node }] of nodes.entries()) {
    const effective = await args.access.getEffectivePermissions({ principal: args.actor, node });
    if (effective.ok) return ok(undefined);
    if (index === 0) firstReason = effective.reason;
  }
  return err(new AccessDeniedError(firstReason));
};

/**
 * The caller's live grant nodes in the organization, widest first, with the roles merged per
 * node (`GET /v1/me/grants`, decision 0030 A7). A node counts when `getEffectivePermissions`
 * accepts it, the same check as `requireOrganizationMember`, so a grant on a deleted project
 * or unit is skipped. At most `MAX_MEMBERSHIP_NODES_CHECKED` nodes. Fail-closed.
 * @returns the denial of `requireOrganizationMember` when no node is live.
 */
export const listLiveGrantNodes = async (deps: Deps, args: MemberArgs): Promise<Result<MyGrant[], AccessDeniedError>> => {
  const nodes = await readGrantNodes(deps, args);
  const checks = await Promise.all(nodes.map(({ node }) => args.access.getEffectivePermissions({ principal: args.actor, node })));
  const live = nodes.filter((_, index) => checks[index]?.ok === true);
  if (live.length > 0) return ok(live);
  const first = checks[0];
  return err(new AccessDeniedError(first === undefined || first.ok ? "NOT_A_MEMBER" : first.reason));
};
