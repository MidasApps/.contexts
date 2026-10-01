// Composition root of the session vertical (SP1 Task 13, decision 0007): web session cookie,
// desktop sessions and session management.
import type { SessionDeps } from "./application/session-deps.ts";
import { makeCreateDesktopSession, type CreateDesktopSession } from "./application/use-cases/create-desktop-session.ts";
import { makeCreateWebSession, type CreateWebSession } from "./application/use-cases/create-web-session.ts";
import { makeExchangeDesktopSession, type ExchangeDesktopSession } from "./application/use-cases/exchange-desktop-session.ts";
import { makeExchangeWebSession, type ExchangeWebSession } from "./application/use-cases/exchange-web-session.ts";
import { makeListSessions, type ListSessions } from "./application/use-cases/list-sessions.ts";
import { makeRequirePlatformStaffSession, type RequirePlatformStaffSession } from "./application/use-cases/require-platform-staff-session.ts";
import { makeRequireWebSession, type RequireWebSession } from "./application/use-cases/require-web-session.ts";
import { makeRevokeAllSessions, type RevokeAllSessions } from "./application/use-cases/revoke-all-sessions.ts";
import { makeRevokeSession, type RevokeSession } from "./application/use-cases/revoke-session.ts";
import { makeSignOutWebSession, type SignOutWebSession } from "./application/use-cases/sign-out-web-session.ts";
import { makeEnterImpersonation, makeLeaveImpersonation, type EnterImpersonation, type LeaveImpersonation } from "./application/use-cases/web-session-impersonation.ts";

export type SessionServices = {
  readonly createWebSession: CreateWebSession;
  readonly exchangeWebSession: ExchangeWebSession;
  readonly signOutWebSession: SignOutWebSession;
  /** Staff opens the app as the user of an open impersonation session, across reloads (decision 0047). */
  readonly enterImpersonation: EnterImpersonation;
  /** Ends that impersonation and returns the staff token (decision 0047). */
  readonly leaveImpersonation: LeaveImpersonation;
  readonly requireWebSession: RequireWebSession;
  readonly requirePlatformStaffSession: RequirePlatformStaffSession;
  readonly listSessions: ListSessions;
  readonly revokeSession: RevokeSession;
  readonly revokeAllSessions: RevokeAllSessions;
  readonly createDesktopSession: CreateDesktopSession;
  readonly exchangeDesktopSession: ExchangeDesktopSession;
};

/** Binds the session use cases to their adapters (Firebase in `createCoreServer`, fakes in tests). */
export const createSessionServices = (deps: SessionDeps): SessionServices => ({
  createWebSession: makeCreateWebSession(deps),
  exchangeWebSession: makeExchangeWebSession(deps),
  signOutWebSession: makeSignOutWebSession(deps),
  enterImpersonation: makeEnterImpersonation(deps),
  leaveImpersonation: makeLeaveImpersonation(deps),
  requireWebSession: makeRequireWebSession(deps),
  requirePlatformStaffSession: makeRequirePlatformStaffSession(deps),
  listSessions: makeListSessions(deps),
  revokeSession: makeRevokeSession(deps),
  revokeAllSessions: makeRevokeAllSessions(deps),
  createDesktopSession: makeCreateDesktopSession(deps),
  exchangeDesktopSession: makeExchangeDesktopSession(deps),
});
