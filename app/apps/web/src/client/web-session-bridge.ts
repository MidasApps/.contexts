import { ApiError } from "@core/client/shared/api";
import type { SessionBridgePort } from "@core/client/shared/lib/session-bridge";

type ActionError = { readonly code: string; readonly message: string; readonly requestId: string; readonly details?: readonly { field: string; issue: string }[] | undefined };
type ActionResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ActionError };

/** The web session Server Actions (`src/app/[locale]/(auth)/actions.ts`, SP1 decision 0007). */
export type WebSessionActions = {
  readonly createSession: (input: { idToken: string }) => Promise<ActionResult<{ expiresAt: string }>>;
  readonly exchangeSession: () => Promise<ActionResult<{ customToken: string }>>;
  readonly signOut: () => Promise<ActionResult<null>>;
  readonly enterImpersonation: (input: { impersonationSessionId: string }) => Promise<ActionResult<{ customToken: string }>>;
  readonly leaveImpersonation: () => Promise<ActionResult<{ customToken: string }>>;
};

// HTTP-equivalent status of the codes the session actions answer, so `isClientError` works.
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  RECENT_SIGN_IN_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
};

const toApiError = (error: ActionError): ApiError =>
  new ApiError({ status: STATUS_BY_CODE[error.code] ?? 500, code: error.code, message: error.message, details: error.details, requestId: error.requestId });

const dataOf = <T>(result: ActionResult<T>): T => {
  if (!result.ok) throw toApiError(result.error);
  return result.data;
};

/**
 * Session bridge of the web (SP2 spec §2.2): the `__session` HttpOnly cookie is created, exchanged
 * for a custom token on boot and revoked on sign-out by Server Actions; the browser keeps no token.
 * @throws {ApiError} from `establish`/`end` (and `restore`, except "no session") with the action's code.
 */
export const createWebSessionBridge = (actions: WebSessionActions): SessionBridgePort => ({
  establish: async ({ idToken }) => {
    dataOf(await actions.createSession({ idToken }));
  },
  restore: async () => {
    const result = await actions.exchangeSession();
    if (!result.ok && result.error.code === "UNAUTHORIZED") return null;
    return dataOf(result);
  },
  end: async () => {
    dataOf(await actions.signOut());
  },
  // Support access (decision 0047): the cookie session remembers the impersonation across reloads.
  enterImpersonation: async (input) => dataOf(await actions.enterImpersonation(input)),
  leaveImpersonation: async () => dataOf(await actions.leaveImpersonation()),
});
