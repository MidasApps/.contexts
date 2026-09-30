import type { RequestId } from "@core/contracts";
import type { Logger } from "../../../shared/observability/logger.ts";
import { resolveRequestId } from "../../../shared/observability/request-id.ts";
import { CreateWebSessionInputSchema } from "../../application/use-cases/create-web-session.schema.ts";
import type { SessionServices } from "../../session-composition.ts";

/** The web session cookie (Firebase Hosting / App Hosting forward only `__session`). */
export const SESSION_COOKIE_NAME = "__session";

/**
 * Cookie port of the web app (`apps/web/src/server/session-cookie-jar.ts` over Next
 * `cookies()`); the adapter owns the flags (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`).
 */
export type CookieJar = {
  readonly get: (name: string) => string | undefined;
  readonly set: (name: string, value: string, options: { maxAgeSeconds: number }) => void;
  readonly delete: (name: string) => void;
};

/** What each Server Action gets from its request. */
export type SessionActionContext = {
  readonly cookies: CookieJar;
  /** The request `Origin` header; must equal `NEXT_PUBLIC_APP_URL`'s origin (CSRF guard). */
  readonly origin: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string | null;
};

export type SessionActionError = { readonly code: string; readonly message: string; readonly details?: readonly { field: string; issue: string }[]; readonly requestId: RequestId };

/** Server Action result (framework ADR 0003 shape). */
export type SessionActionResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: SessionActionError };

export type SessionActions = {
  /** `createSession({ idToken })` → sets `__session`. */
  readonly createSession: (input: unknown, context: SessionActionContext) => Promise<SessionActionResult<{ expiresAt: string }>>;
  /** `exchangeSession()` → a custom token for `signInWithCustomToken` (in memory). */
  readonly exchangeSession: (context: SessionActionContext) => Promise<SessionActionResult<{ customToken: string }>>;
  /** `signOut()` → revokes the record and deletes `__session`. */
  readonly signOut: (context: SessionActionContext) => Promise<SessionActionResult<null>>;
};

const MESSAGES: Readonly<Record<string, string>> = {
  FORBIDDEN: "You do not have permission to do this.",
  UNAUTHORIZED: "Authentication required.",
  RECENT_SIGN_IN_REQUIRED: "Sign in again to continue.",
  VALIDATION_FAILED: "One or more fields are invalid.",
};

const failure = (code: string, requestId: RequestId, details?: SessionActionError["details"]): { ok: false; error: SessionActionError } => ({
  ok: false,
  error: { code, message: MESSAGES[code] ?? "The request could not be completed.", requestId, ...(details === undefined ? {} : { details }) },
});

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * Framework-free Server Action bodies of the web session (SP1 spec §3.3, decision 0007).
 * SP2 wraps each in a one-line `"use server"` function with the Next cookie jar.
 * @param appUrl `NEXT_PUBLIC_APP_URL`: only same-origin calls are served.
 */
export const makeSessionActions = (deps: { sessions: SessionServices; appUrl: string; logger: Logger }): SessionActions => {
  const expectedOrigin = originOf(deps.appUrl);
  // Next checks the Server Action origin too; this second check does not depend on its config.
  const begin = (context: SessionActionContext) => {
    const requestId = resolveRequestId(context.requestId);
    const allowed = expectedOrigin !== null && context.origin === expectedOrigin;
    if (!allowed) deps.logger.warn("session_action_origin_refused", { requestId });
    return { requestId, allowed };
  };
  return {
    createSession: async (input, context) => {
      const { requestId, allowed } = begin(context);
      if (!allowed) return failure("FORBIDDEN", requestId);
      const parsed = CreateWebSessionInputSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_FAILED", requestId, parsed.error.issues.map((issue) => ({ field: issue.path.map(String).join("."), issue: issue.code.toUpperCase() })));
      const created = await deps.sessions.createWebSession({ idToken: parsed.data.idToken, userAgent: context.userAgent ?? null });
      if (!created.ok) return failure(created.error.code, requestId);
      context.cookies.set(SESSION_COOKIE_NAME, created.data.cookie, { maxAgeSeconds: created.data.maxAgeSeconds });
      deps.logger.info("web_session_created", { requestId, sessionId: created.data.sessionId });
      return { ok: true, data: { expiresAt: created.data.expiresAt } };
    },
    exchangeSession: async (context) => {
      const { requestId, allowed } = begin(context);
      if (!allowed) return failure("FORBIDDEN", requestId);
      const exchanged = await deps.sessions.exchangeWebSession({ cookie: context.cookies.get(SESSION_COOKIE_NAME) });
      if (exchanged.ok) return exchanged;
      context.cookies.delete(SESSION_COOKIE_NAME);
      return failure("UNAUTHORIZED", requestId);
    },
    signOut: async (context) => {
      const { requestId, allowed } = begin(context);
      if (!allowed) return failure("FORBIDDEN", requestId);
      await deps.sessions.signOutWebSession({ cookie: context.cookies.get(SESSION_COOKIE_NAME), requestId });
      context.cookies.delete(SESSION_COOKIE_NAME);
      return { ok: true, data: null };
    },
  };
};
