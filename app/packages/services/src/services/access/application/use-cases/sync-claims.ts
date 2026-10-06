import { type UserId, UserIdSchema } from "@core/contracts";
import type { Logger } from "#/services/shared/observability/logger.ts";
import type { AccessProjectionStore } from "../ports/driven/access-projection-writer.ts";
import type { ClaimsWriter, CoreClaims } from "../ports/driven/claims-writer.ts";
import type { PrincipalStatusReader } from "../ports/driven/principal-status-reader.ts";
import type { UserAccessVersionStore } from "../ports/driven/user-access-version.ts";

/**
 * Projects a user's claims from the source (SP1 spec §5.4) after a grant change.
 * @returns false when the sync failed; the failure is logged, never thrown.
 */
export type SyncClaims = (uid: UserId) => Promise<boolean>;

type SyncClaimsDeps = {
  readonly users: UserAccessVersionStore;
  readonly projections: AccessProjectionStore;
  readonly principals: Pick<PrincipalStatusReader, "getPlatformStaff">;
  readonly claims: ClaimsWriter;
};

/**
 * Reads the users doc, the access projection of the active organization and the staff
 * doc, and computes the core claims. `tenantId` is set only while that projection is live.
 * @throws whatever a reader throws (infrastructure).
 */
export const computeCoreClaims = async (deps: Omit<SyncClaimsDeps, "claims">, uid: UserId): Promise<CoreClaims> => {
  const [user, staff] = await Promise.all([deps.users.read(undefined, uid), deps.principals.getPlatformStaff(uid)]);
  const tenantId = user?.activeOrganizationId ?? null;
  const projection = tenantId === null ? null : await deps.projections.get(undefined, { tenantId, principalId: uid });
  return {
    accessVersion: user?.accessVersion ?? 0,
    ...(tenantId !== null && projection !== null && !projection.isRevoked ? { tenantId } : {}),
    ...(staff?.isActive === true ? { platformRole: staff.role } : {}),
  };
};

/** Builds `syncClaims(uid)`: compute from the source, write, log failures. */
export const makeSyncClaims =
  (deps: SyncClaimsDeps & { readonly logger: Logger }): SyncClaims =>
  async (uid) => {
    try {
      await deps.claims.writeClaims(UserIdSchema.parse(uid), await computeCoreClaims(deps, uid));
      return true;
    } catch (e: unknown) {
      // Claims are a projection; POST /v1/me/claims/sync heals a failed sync (SP1 spec §5.4).
      deps.logger.error("claims_sync_failed", { userId: uid, err: e });
      return false;
    }
  };
