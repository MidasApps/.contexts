import type { TenantId, TenantNodeRef, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import type { RequestAccess } from "../composition.ts";
import { nodeIdOf } from "../domain/access-projection.ts";
import type { DenyReason } from "../domain/authorization.ts";
import { AccessDeniedError } from "../domain/errors/access-denied-error.ts";
import type { MembershipRepository } from "./ports/driven/membership-repository.ts";

/** Bounds the reads of one check; a member rarely holds this many grants in one organization. */
export const MAX_MEMBERSHIP_NODES_CHECKED = 50;

const LEVEL_ORDER: Record<TenantNodeRef["level"], number> = { organization: 0, project: 1, unit: 2 };

// Distinct grant nodes, organization first: the cheapest chain and the widest grant decide first.
const distinctNodes = (nodes: readonly TenantNodeRef[]): TenantNodeRef[] => {
  const byId = new Map(nodes.map((node) => [`${node.level}:${nodeIdOf(node)}`, node]));
  return [...byId.values()].sort((left, right) => LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level]).slice(0, MAX_MEMBERSHIP_NODES_CHECKED);
};

/**
 * Whether the user is a live member of the organization (decision 0030 A5): it holds at least
 * one live grant, anywhere in the organization's tree, on a node `getEffectivePermissions`
 * accepts (live node chain, active organization, active user). Grants come from the source of
 * truth (`memberships`), never from the access projection. It grants nothing: the member still
 * reads only what its grants allow. Fail-closed: a reader error rejects.
 * @returns `NOT_A_MEMBER` without any live grant, otherwise the first node's deny reason.
 */
export const requireOrganizationMember = async (
  deps: { readonly memberships: Pick<MembershipRepository, "listOfPrincipals"> },
  args: { access: RequestAccess; actor: UserPrincipal; tenantId: TenantId },
): Promise<Result<void, AccessDeniedError>> => {
  const grants = await deps.memberships.listOfPrincipals({ tenantId: args.tenantId, principalIds: [args.actor.uid] });
  const nodes = distinctNodes(grants.filter((grant) => grant.principalType === "user" && grant.node.tenantId === args.tenantId).map((grant) => grant.node));
  let firstReason: DenyReason = "NOT_A_MEMBER";
  for (const [index, node] of nodes.entries()) {
    const effective = await args.access.getEffectivePermissions({ principal: args.actor, node });
    if (effective.ok) return ok(undefined);
    if (index === 0) firstReason = effective.reason;
  }
  return err(new AccessDeniedError(firstReason));
};
