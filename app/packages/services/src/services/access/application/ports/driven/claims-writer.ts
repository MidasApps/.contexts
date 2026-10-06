import type { PlatformRole, TenantId } from "@core/contracts";

/** The custom claims the core owns (SP1 spec §5.4); a claim never grants anything. */
export type CoreClaims = {
  /** Active organization, only while the user's projection there is live. */
  readonly tenantId?: TenantId;
  /** Role of an active platform staff member. */
  readonly platformRole?: PlatformRole;
  readonly accessVersion: number;
};

/** Claim keys written by `ClaimsWriter`; every other claim is preserved. */
export const CORE_CLAIM_KEYS = ["tenantId", "platformRole", "accessVersion"] as const;

/**
 * Writes the core claims of a user. `setCustomUserClaims` overwrites the whole object,
 * so the adapter reads the current claims and keeps the ones it does not own.
 */
export type ClaimsWriter = { readonly writeClaims: (uid: string, claims: CoreClaims) => Promise<void> };
