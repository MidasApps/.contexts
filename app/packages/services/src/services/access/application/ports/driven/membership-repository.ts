import type { Membership, MembershipId, RoleId, RoleRef, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/**
 * Source of truth of grants (`memberships`, SP1 spec §4). Reads take the use case's
 * transaction (Firestore: every read before the first write); writes are buffered in it.
 * Every read returns live grants only (`deletedAt == null`).
 */
export type MembershipRepository = {
  readonly newId: () => MembershipId;
  readonly get: (tx: Transaction | undefined, id: MembershipId) => Promise<Membership | null>;
  readonly listOfPrincipal: (tx: Transaction, args: { tenantId: TenantId; principalId: string }) => Promise<Membership[]>;
  /** Live grants of several principals of a tenant (member lists; any number of ids). */
  readonly listOfPrincipals: (args: { tenantId: TenantId; principalIds: readonly string[] }) => Promise<Membership[]>;
  /** A page of the tenant's live grants, oldest first (`createdAt`, id), optionally of one principal. */
  readonly list: (args: { tenantId: TenantId; principalId?: string | undefined; page: PageRequest }) => Promise<Page<Membership>>;
  /** Organization-level user grants holding the system `owner` role (last-owner guard). */
  readonly listOrganizationOwners: (tx: Transaction, tenantId: TenantId) => Promise<Membership[]>;
  readonly isRoleInUse: (tx: Transaction, args: { tenantId: TenantId; roleId: RoleId }) => Promise<boolean>;
  readonly create: (tx: Transaction, args: { membership: Membership; actorId: string }) => void;
  readonly updateRoles: (tx: Transaction, args: { id: MembershipId; roles: readonly RoleRef[]; updatedAt: string; actorId: string }) => void;
  readonly softDelete: (tx: Transaction, args: { id: MembershipId; deletedAt: string; actorId: string }) => void;
};
