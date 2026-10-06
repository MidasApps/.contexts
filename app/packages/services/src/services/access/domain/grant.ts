import type { MembershipId, RoleId, RoleRef, TenantId } from "@core/contracts";

/** A membership as access decisions need it (source of truth, never the projection). */
export type GrantRecord = {
  readonly membershipId: MembershipId;
  readonly tenantId: TenantId;
  readonly principalId: string;
  readonly nodeId: string;
  readonly roles: readonly RoleRef[];
  readonly isDeleted: boolean;
};

/** A custom role as access decisions need it; permissions may hold ids no longer registered. */
export type CustomRoleRecord = {
  readonly id: RoleId;
  readonly tenantId: TenantId;
  readonly permissions: readonly string[];
  readonly isDeleted: boolean;
};
