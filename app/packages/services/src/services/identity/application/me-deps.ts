import type { Me, PlatformRole, User } from "@core/contracts";
import type { AccessProjectionStore } from "../../access/application/ports/driven/access-projection-writer.ts";
import type { PrincipalStatusReader } from "../../access/application/ports/driven/principal-status-reader.ts";
import type { SyncClaims } from "../../access/application/use-cases/sync-claims.ts";
import type { AccessCore, AccessServices } from "../../access/composition.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { OrganizationRepository } from "../../tenancy/application/ports/driven/organization-repository.ts";
import type { LoadNode } from "../../tenancy/application/use-cases/resolve-regional-settings.ts";
import type { AuthAccountReader } from "./ports/driven/auth-account-reader.ts";
import type { UserRepository } from "./ports/driven/user-repository.ts";

/** Dependencies of the `/v1/me*` use cases and `resolveAccessContext` (SP1 Task 12). */
export type MeDeps = {
  readonly users: UserRepository;
  readonly accounts: AuthAccountReader;
  readonly staff: Pick<PrincipalStatusReader, "getPlatformStaff">;
  /** A fresh request scope per `resolveAccessContext` call (SP3 calls it outside `/v1`). */
  readonly access: AccessCore;
  readonly projections: Pick<AccessProjectionStore, "listOfPrincipal">;
  /** Membership check of `PUT /v1/me/active-organization` and the grant nodes of `GET /v1/me/grants` (decision 0030 A5, A7). */
  readonly membership: Pick<AccessServices, "requireOrganizationMember" | "listLiveGrantNodes">;
  readonly syncClaims: SyncClaims;
  readonly organizations: Pick<OrganizationRepository, "get">;
  readonly loadNode: LoadNode;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
};

/** Staff flags and MFA enrollment `Me` adds to the users doc. */
export type MeFlags = { readonly platformRole: PlatformRole | null; readonly mfaEnrolled: boolean };

/** The `Me` view of a users doc (SP1 spec §7.3). */
export const toMe = (user: User, flags: MeFlags): Me => {
  return {
    uid: user.id,
    email: user.email,
    displayName: user.displayName,
    ...(user.photoUrl === undefined ? {} : { photoUrl: user.photoUrl }),
    preferences: user.preferences,
    lastContext: user.lastContext,
    accessVersion: user.accessVersion,
    isPlatformStaff: flags.platformRole !== null,
    ...(flags.platformRole === null ? {} : { platformRole: flags.platformRole }),
    mfaEnrolled: flags.mfaEnrolled,
  };
};
