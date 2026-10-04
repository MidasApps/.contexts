import type { Membership } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { holdsOwner } from "../../domain/role-permissions.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";

/**
 * Whether removing the owner role from `membership` leaves its organization without an
 * owner grant (SP1 spec §5.3). Only organization-level user grants count as owners.
 */
export const wouldLoseLastOwner = async (
  tx: Transaction,
  deps: Pick<AccessWriteDeps, "memberships">,
  membership: Membership,
): Promise<boolean> => {
  if (membership.node.level !== "organization" || membership.principalType !== "user" || !holdsOwner(membership.roles))
    return false;
  const owners = await deps.memberships.listOrganizationOwners(tx, membership.tenantId);
  return !owners.some((owner) => owner.id !== membership.id);
};
