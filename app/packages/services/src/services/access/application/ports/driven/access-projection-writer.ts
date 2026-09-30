import type { AccessProjection, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/**
 * Writes the read model `access/{tenantId}_{principalId}` (SP1 spec §5.4); only list
 * screens and Security Rules read it, never `authorize()`.
 */
export type AccessProjectionStore = {
  readonly get: (tx: Transaction | undefined, args: { tenantId: TenantId; principalId: string }) => Promise<AccessProjection | null>;
  readonly write: (tx: Transaction, args: { projection: AccessProjection; actorId: string }) => void;
  /** Up to `limit` projections of the tenant that are not revoked yet. */
  readonly listUnrevoked: (tx: Transaction | undefined, args: { tenantId: TenantId; limit: number }) => Promise<AccessProjection[]>;
  /** Marks projections revoked (bumping `version`), in `tx` or in one batch when `tx` is undefined. */
  readonly markRevoked: (tx: Transaction | undefined, args: { projections: readonly AccessProjection[]; updatedAt: string; actorId: string }) => Promise<void>;
};
