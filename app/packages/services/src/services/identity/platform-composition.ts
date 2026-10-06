// Composition root of platform staff and impersonation (SP1 Task 16, SP1 spec §3.4, §6.6).
import type { Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS } from "../shared/firestore/collections.ts";
import { createFirestoreUnitOfWork } from "../shared/firestore/unit-of-work.ts";
import {
  createFirestoreImpersonationSessionRepository,
  createFirestorePlatformStaffRepository,
} from "./adapters/driven/firestore-platform-repositories.ts";
import type { PlatformDeps } from "./application/platform-deps.ts";
import {
  type EndImpersonationSession,
  type ListImpersonationSessions,
  makeEndImpersonationSession,
  makeListImpersonationSessions,
  OPEN_IMPERSONATION_SESSIONS_MAX,
} from "./application/use-cases/admin-impersonation-sessions.ts";
import {
  type AuditImpersonatedRequest,
  makeAuditImpersonatedRequest,
} from "./application/use-cases/audit-impersonated-request.ts";
import { type EndImpersonation, makeEndImpersonation } from "./application/use-cases/end-impersonation.ts";
import { type GrantPlatformStaff, makeGrantPlatformStaff } from "./application/use-cases/grant-platform-staff.ts";
import {
  type ListPlatformStaff,
  makeListPlatformStaff,
  makeRevokePlatformStaff,
  makeSetPlatformStaffRole,
  type RevokePlatformStaff,
  type SetPlatformStaffRole,
} from "./application/use-cases/manage-platform-staff.ts";
import { makeStartImpersonation, type StartImpersonation } from "./application/use-cases/start-impersonation.ts";

export type PlatformServices = {
  readonly startImpersonation: StartImpersonation;
  readonly endImpersonation: EndImpersonation;
  /** Staff console (decision 0044): every staff member's sessions, and ending any of them. */
  readonly listImpersonationSessions: ListImpersonationSessions;
  readonly endImpersonationSession: EndImpersonationSession;
  /** Operator tooling only (`pnpm platform:grant-staff`, `pnpm seed:local`). */
  readonly grantPlatformStaff: GrantPlatformStaff;
  /** Staff console (decision 0075): the staff list, a role change and a revoke by another admin. */
  readonly listPlatformStaff: ListPlatformStaff;
  readonly setPlatformStaffRole: SetPlatformStaffRole;
  readonly revokePlatformStaff: RevokePlatformStaff;
  /** The `/v1` pipeline reports every impersonated request here (`ApiRouteDeps.onImpersonatedRequest`). */
  readonly auditImpersonatedRequest: AuditImpersonatedRequest;
};

/** Binds the platform use cases to their adapters. */
export const createPlatformServices = (deps: PlatformDeps): PlatformServices => {
  const endImpersonationSession = makeEndImpersonationSession(deps);
  // A revoked staff member's support sessions end with the revoke (each audited like any end).
  const endSessionsOf: Parameters<typeof makeRevokePlatformStaff>[0]["endSessionsOf"] = async (command) => {
    const open = await deps.impersonations.listOpen({ now: deps.clock.now(), limit: OPEN_IMPERSONATION_SESSIONS_MAX });
    for (const session of open.filter((candidate) => candidate.staffUid === command.userId))
      await endImpersonationSession({ actor: command.actor, sessionId: session.id, requestId: command.requestId });
  };
  return {
    startImpersonation: makeStartImpersonation(deps),
    endImpersonation: makeEndImpersonation(deps),
    listImpersonationSessions: makeListImpersonationSessions(deps),
    endImpersonationSession,
    grantPlatformStaff: makeGrantPlatformStaff(deps),
    auditImpersonatedRequest: makeAuditImpersonatedRequest(deps),
    listPlatformStaff: makeListPlatformStaff(deps),
    setPlatformStaffRole: makeSetPlatformStaffRole(deps),
    revokePlatformStaff: makeRevokePlatformStaff({ ...deps, endSessionsOf }),
  };
};

/** The platform vertical over Firestore (`createCoreServer`). */
export const createFirestorePlatformServices = (
  deps: Omit<PlatformDeps, "staff" | "impersonations" | "unitOfWork" | "users"> & { firestore: Firestore },
): PlatformServices => {
  const { firestore, ...rest } = deps;
  return createPlatformServices({
    ...rest,
    users: { exists: async (uid) => (await firestore.collection(CORE_COLLECTIONS.users).doc(uid).get()).exists },
    staff: createFirestorePlatformStaffRepository({ firestore }),
    impersonations: createFirestoreImpersonationSessionRepository({ firestore }),
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
  });
};
