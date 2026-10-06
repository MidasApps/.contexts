import type { Principal } from "@core/contracts";
import {
  type IdempotencyBegin,
  type IdempotencyStore,
  idempotencyScopeKey,
  type StoredResponse,
} from "../idempotency/idempotency-store.ts";
import { hashRequest } from "../idempotency/request-hash.ts";
import { apiError } from "./api-errors.ts";

/**
 * Endpoints whose success carries a one-time secret (accept link, API key, activation code,
 * session secret, custom token): an idempotent replay must not hand it out again, so their
 * successes are stored without body (decision 0030 §5).
 */
export const ONE_TIME_SECRET_ENDPOINT_IDS: ReadonlySet<string> = new Set([
  "access.createInvitation",
  "identity.createApiKey",
  "identity.createDeviceActivation",
  "identity.redeemDeviceActivation",
  "identity.createDesktopSession",
  "identity.exchangeDesktopSession",
  "identity.startImpersonation",
]);

/**
 * Stable key of a caller for rate limits and idempotency scopes; never logged. An
 * impersonated user is scoped by session, so staff never replays the user's own results.
 */
export const principalKey = (principal: Principal | undefined, clientIp: string): string => {
  if (principal === undefined) return `ip:${clientIp}`;
  switch (principal.type) {
    case "user":
      return principal.impersonation === undefined
        ? `user:${principal.uid}`
        : `user:${principal.uid}:imp:${principal.impersonation.sessionId}`;
    case "device":
      return `device:${principal.deviceId}`;
    case "service":
      return `service:${principal.apiKeyId}`;
  }
};

export type IdempotentAttempt = {
  readonly begin: IdempotencyBegin;
  /** Stores the response sent (status < 500) or frees the key (5xx), so a failed attempt can be retried. */
  readonly finish: (response: Response) => Promise<void>;
  /** Frees the key after a throw. */
  readonly abandon: () => Promise<void>;
};

const toStored = async (response: Response, redactSuccess: boolean): Promise<StoredResponse> => {
  const location = response.headers.get("location");
  const where = location === null ? {} : { location };
  if (redactSuccess && response.status < 300) return { status: response.status, body: null, ...where, redacted: true };
  const text = await response.clone().text();
  return { status: response.status, body: text === "" ? null : text, ...where };
};

/** Opens the idempotent attempt of one request (decision 0009 §3). */
export const beginIdempotentAttempt = async (args: {
  store: IdempotencyStore;
  principalKey: string;
  endpointId: string;
  idempotencyKey: string;
  input: { params: unknown; query: unknown; body: unknown };
  /** The endpoint returns a one-time secret: store its successes without body. */
  redactSuccess: boolean;
}): Promise<IdempotentAttempt> => {
  const scopeKey = idempotencyScopeKey({
    principalKey: args.principalKey,
    endpointId: args.endpointId,
    idempotencyKey: args.idempotencyKey,
  });
  const begin = await args.store.begin(scopeKey, hashRequest(args.input));
  const attemptId = begin.kind === "new" ? begin.attemptId : "";
  return {
    begin,
    finish: async (response) =>
      response.status >= 500
        ? args.store.release(scopeKey, attemptId)
        : args.store.complete(scopeKey, attemptId, await toStored(response, args.redactSuccess)),
    abandon: () => args.store.release(scopeKey, attemptId),
  };
};

// A stored error envelope names the request that produced it; the replay answers with its own.
const withRequestId = (body: string, requestId: string): string => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || !("error" in parsed)) return body;
    const { error } = parsed;
    if (typeof error !== "object" || error === null) return body;
    return JSON.stringify({ ...parsed, error: { ...error, requestId } });
  } catch {
    // SyntaxError: not JSON (never stored by this pipeline); replay it as it is.
    return body;
  }
};

/**
 * Rebuilds a stored response for `requestId`, marked with `Idempotent-Replayed: true`. A
 * redacted success answers 409 CONFLICT with the created resource's `Location`: the
 * one-time secret is gone, the resource exists.
 */
export const replayResponse = (stored: StoredResponse, requestId: string): Response => {
  const replayed = {
    "idempotent-replayed": "true",
    ...(stored.location === undefined ? {} : { location: stored.location }),
  };
  if (stored.redacted === true) {
    const conflict = apiError(409, "CONFLICT", requestId);
    for (const [name, value] of Object.entries(replayed)) conflict.headers.set(name, value);
    return conflict;
  }
  const headers: Record<string, string> = { "cache-control": "no-store", ...replayed };
  if (stored.body !== null) headers["content-type"] = "application/json";
  return new Response(stored.body === null ? null : withRequestId(stored.body, requestId), {
    status: stored.status,
    headers,
  });
};
