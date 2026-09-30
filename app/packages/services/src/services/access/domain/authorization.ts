import type { MembershipId, PlatformRole, RoleRef } from "@core/contracts";

/**
 * Why `authorize()` denied (SP1 spec §5.2). Logged and audited, never sent to the
 * client as is: the route maps a denial to 403 FORBIDDEN or 404 NOT_FOUND.
 */
export type DenyReason =
  | "UNKNOWN_PERMISSION"
  | "SCOPE_MISMATCH"
  | "NODE_NOT_FOUND"
  | "ORGANIZATION_SUSPENDED"
  | "PRINCIPAL_INACTIVE"
  | "NOT_A_MEMBER"
  | "PERMISSION_NOT_GRANTED"
  | "OUTSIDE_KEY_SCOPE"
  | "KEY_EXPIRED"
  | "MFA_REQUIRED"
  | "IMPERSONATION_READ_ONLY"
  | "IMPERSONATION_EXPIRED"
  | "CEILING_EXCLUDES";

/** Where an allowed permission came from: a membership (tenant) or a staff role (platform). */
export type GrantSource =
  | { readonly kind: "membership"; readonly membershipId: MembershipId; readonly nodeId: string; readonly roles: readonly RoleRef[] }
  | { readonly kind: "platform-role"; readonly role: PlatformRole };

export type AuthorizeDecision =
  | { readonly allowed: true; readonly requiresApproval: boolean; readonly grantedVia: readonly GrantSource[] }
  | { readonly allowed: false; readonly reason: DenyReason };

export const deny = (reason: DenyReason): AuthorizeDecision => ({ allowed: false, reason });
