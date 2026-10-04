// Composition root of platform staff and impersonation (SP1 Task 16, SP1 spec §3.4, §6.6).
import type { Firestore } from "firebase-admin/firestore";
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
} from "./application/use-cases/admin-impersonation-sessions.ts";
import {
  type AuditImpersonatedRequest,
  makeAuditImpersonatedRequest,
} from "./application/use-cases/audit-impersonated-request.ts";
import { type EndImpersonation, makeEndImpersonation } from "./application/use-cases/end-impersonation.ts";
import { type GrantPlatformStaff, makeGrantPlatformStaff } from "./application/use-cases/grant-platform-staff.ts";
import { makeStartImpersonation, type StartImpersonation } from "./application/use-cases/start-impersonation.ts";

export type PlatformServices = {
  readonly startImpersonation: StartImpersonation;
  readonly endImpersonation: EndImpersonation;
  /** Staff console (decision 0044): every staff member's sessions, and ending any of them. */
  readonly listImpersonationSessions: ListImpersonationSessions;
  readonly endImpersonationSession: EndImpersonationSession;
  /** Operator tooling only (`pnpm platform:grant-staff`, `pnpm seed:local`). */
  readonly grantPlatformStaff: GrantPlatformStaff;
  /** The `/v1` pipeline reports every impersonated request here (`ApiRouteDeps.onImpersonatedRequest`). */
  readonly auditImpersonatedRequest: AuditImpersonatedRequest;
};

/** Binds the platform use cases to their adapters. */
export const createPlatformServices = (deps: PlatformDeps): PlatformServices => ({
  startImpersonation: makeStartImpersonation(deps),
  endImpersonation: makeEndImpersonation(deps),
  listImpersonationSessions: makeListImpersonationSessions(deps),
  endImpersonationSession: makeEndImpersonationSession(deps),
  grantPlatformStaff: makeGrantPlatformStaff(deps),
  auditImpersonatedRequest: makeAuditImpersonatedRequest(deps),
});

/** The platform vertical over Firestore (`createCoreServer`). */
export const createFirestorePlatformServices = (
  deps: Omit<PlatformDeps, "staff" | "impersonations" | "unitOfWork"> & { firestore: Firestore },
): PlatformServices => {
  const { firestore, ...rest } = deps;
  return createPlatformServices({
    ...rest,
    staff: createFirestorePlatformStaffRepository({ firestore }),
    impersonations: createFirestoreImpersonationSessionRepository({ firestore }),
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
  });
};
