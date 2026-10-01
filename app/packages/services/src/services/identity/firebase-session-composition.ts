// Firebase wiring of the session vertical for `createCoreServer` (SP1 Task 13): Firestore
// `sessions`, Firebase Auth cookies, custom tokens and account admin.
import type { PrincipalStatusReader } from "../access/application/ports/driven/principal-status-reader.ts";
import type { RandomBytes } from "../access/domain/invitation-token.ts";
import type { AuditWriter } from "../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../shared/clock/clock.ts";
import type { FirebaseAdmin } from "../shared/firebase/firebase-admin.ts";
import { createFirestoreUnitOfWork } from "../shared/firestore/unit-of-work.ts";
import type { Logger } from "../shared/observability/logger.ts";
import { createFirebaseAuthUserAdmin } from "./adapters/driven/firebase-auth-user-admin.ts";
import { createFirebaseCustomTokenIssuer } from "./adapters/driven/firebase-custom-token-issuer.ts";
import { createFirebaseSessionCookieIssuer } from "./adapters/driven/firebase-session-cookie-issuer.ts";
import { createFirestoreImpersonationSessionRepository } from "./adapters/driven/firestore-platform-repositories.ts";
import { createFirestoreSessionRepository } from "./adapters/driven/firestore-session-repository.ts";
import { makeSessionActions, type SessionActions } from "./adapters/driving/session-actions.ts";
import { makeSessionGuards, type SessionGuards } from "./adapters/driving/session-guards.ts";
import type { AuthUserAdmin } from "./application/ports/driven/auth-user-admin.ts";
import type { CustomTokenIssuer } from "./application/ports/driven/custom-token-issuer.ts";
import { createSessionServices, type SessionServices } from "./session-composition.ts";

export const DEFAULT_SESSION_MAX_AGE_DAYS = 5;
export const DEFAULT_DESKTOP_SESSION_MAX_AGE_DAYS = 30;

export type FirebaseSessionVertical = {
  readonly sessions: SessionServices;
  /** Server Action bodies (`createSession`, `exchangeSession`, `signOut`) for SP2's wrappers. */
  readonly sessionActions: SessionActions;
  /** RSC guards (`requireWebSession`, `requirePlatformStaffSession`). */
  readonly sessionGuards: SessionGuards;
  /** Shared with the device vertical. */
  readonly customTokens: CustomTokenIssuer;
  readonly authUsers: AuthUserAdmin;
};

/**
 * Builds the session vertical over Firebase. Without `NEXT_PUBLIC_APP_URL` the Server
 * Actions refuse every call (no origin to compare with; fail-closed).
 */
export const createFirebaseSessionVertical = (args: {
  firebase: FirebaseAdmin;
  principals: Pick<PrincipalStatusReader, "getPlatformStaff" | "getUser">;
  audit: AuditWriter;
  clock: Clock;
  logger: Logger;
  randomBytes: RandomBytes;
  env: { readonly SESSION_MAX_AGE_DAYS?: number; readonly DESKTOP_SESSION_MAX_AGE_DAYS?: number; readonly NEXT_PUBLIC_APP_URL?: string };
}): FirebaseSessionVertical => {
  const { firestore, auth } = args.firebase;
  const customTokens = createFirebaseCustomTokenIssuer({ auth });
  const authUsers = createFirebaseAuthUserAdmin({ auth });
  const sessions = createSessionServices({
    sessions: createFirestoreSessionRepository({ firestore }),
    impersonations: createFirestoreImpersonationSessionRepository({ firestore }),
    cookies: createFirebaseSessionCookieIssuer({ auth }),
    customTokens,
    authUsers,
    principals: args.principals,
    audit: args.audit,
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
    clock: args.clock,
    randomBytes: args.randomBytes,
    logger: args.logger,
    sessionMaxAgeDays: args.env.SESSION_MAX_AGE_DAYS ?? DEFAULT_SESSION_MAX_AGE_DAYS,
    desktopSessionMaxAgeDays: args.env.DESKTOP_SESSION_MAX_AGE_DAYS ?? DEFAULT_DESKTOP_SESSION_MAX_AGE_DAYS,
  });
  return {
    sessions,
    sessionActions: makeSessionActions({ sessions, appUrl: args.env.NEXT_PUBLIC_APP_URL ?? "", logger: args.logger }),
    sessionGuards: makeSessionGuards({ sessions }),
    customTokens,
    authUsers,
  };
};
