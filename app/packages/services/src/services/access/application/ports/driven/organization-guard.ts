import type { TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/**
 * Whether the organization of a grant change still exists, read inside the change's own
 * transaction (decision 0030 §3): `authorize()` checks it before the transaction, so an
 * organization deleted in between would otherwise get a live grant and an un-revoked
 * projection. Firestore makes the read conflict with the delete's write.
 */
export type OrganizationGuard = {
  /** @returns false when the organization is missing or soft-deleted. */
  readonly isLive: (tx: Transaction, tenantId: TenantId) => Promise<boolean>;
};
