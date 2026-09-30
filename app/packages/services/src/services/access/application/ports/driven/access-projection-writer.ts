import type { AccessProjection, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/**
 * Writes the read model `access/{tenantId}_{principalId}` (SP1 spec §5.4); only list
 * screens and Security Rules read it, never `authorize()`.
 */
export type AccessProjectionStore = {
  readonly get: (tx: Transaction | undefined, args: { tenantId: TenantId; principalId: string }) => Promise<AccessProjection | null>;
  readonly write: (tx: Transaction, args: { projection: AccessProjection; actorId: string }) => void;
  /** A page of the tenant's live user projections, one per member, by `principalId` (member lists). */
  readonly listMembers: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<AccessProjection>>;
  /** A page of one principal's live projections, one per organization, by `tenantId` (GET /v1/me/organizations). */
  readonly listOfPrincipal: (args: { principalId: string; page: PageRequest }) => Promise<Page<AccessProjection>>;
  /** Up to `limit` projections of the tenant that are not revoked yet. */
  readonly listUnrevoked: (tx: Transaction | undefined, args: { tenantId: TenantId; limit: number }) => Promise<AccessProjection[]>;
  /** Marks projections revoked (bumping `version`), in `tx` or in one batch when `tx` is undefined. */
  readonly markRevoked: (tx: Transaction | undefined, args: { projections: readonly AccessProjection[]; updatedAt: string; actorId: string }) => Promise<void>;
};
