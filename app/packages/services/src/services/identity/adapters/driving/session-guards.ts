import type { PlatformRole, SessionId, UserPrincipal } from "@core/contracts";
import type { SessionServices } from "../../session-composition.ts";
import { SESSION_COOKIE_NAME } from "./session-actions.ts";

/** Result of `requireWebSession`: the principal, or send the user to sign in. */
export type WebSessionGuardResult = { readonly kind: "session"; readonly principal: UserPrincipal; readonly sessionId: SessionId } | { readonly kind: "redirect" };

/** Result of `requirePlatformStaffSession`: staff, sign in, or `/admin` does not exist (404). */
export type StaffSessionGuardResult =
  | { readonly kind: "staff"; readonly principal: UserPrincipal; readonly sessionId: SessionId; readonly role: PlatformRole }
  | { readonly kind: "redirect" }
  | { readonly kind: "not-found" };

export type SessionGuards = {
  readonly requireWebSession: (cookies: { get: (name: string) => string | undefined }) => Promise<WebSessionGuardResult>;
  readonly requirePlatformStaffSession: (cookies: { get: (name: string) => string | undefined }) => Promise<StaffSessionGuardResult>;
};

/**
 * RSC guards (SP1 spec §3.3 step 4, §3.4), framework-free: SP2 maps `redirect` to
 * `redirect("/{locale}/sign-in")` and `not-found` to `notFound()`.
 */
export const makeSessionGuards = (deps: { sessions: SessionServices }): SessionGuards => ({
  requireWebSession: async (cookies) => {
    const result = await deps.sessions.requireWebSession({ cookie: cookies.get(SESSION_COOKIE_NAME) });
    return result.ok ? { kind: "session", ...result.data } : { kind: "redirect" };
  },
  requirePlatformStaffSession: async (cookies) => {
    const result = await deps.sessions.requirePlatformStaffSession({ cookie: cookies.get(SESSION_COOKIE_NAME) });
    if (result.ok) return { kind: "staff", ...result.data };
    return result.error.code === "NOT_PLATFORM_STAFF" ? { kind: "not-found" } : { kind: "redirect" };
  },
});
