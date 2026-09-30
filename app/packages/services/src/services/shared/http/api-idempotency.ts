import type { Principal } from "@core/contracts";
import { hashRequest } from "../idempotency/request-hash.ts";
import { idempotencyScopeKey, type IdempotencyBegin, type IdempotencyStore, type StoredResponse } from "../idempotency/idempotency-store.ts";

/** Stable key of a caller for rate limits and idempotency scopes; never logged. */
export const principalKey = (principal: Principal | undefined, clientIp: string): string => {
  if (principal === undefined) return `ip:${clientIp}`;
  switch (principal.type) {
    case "user":
      return `user:${principal.uid}`;
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

const toStored = async (response: Response): Promise<StoredResponse> => {
  const text = await response.clone().text();
  const location = response.headers.get("location");
  return { status: response.status, body: text === "" ? null : text, ...(location === null ? {} : { location }) };
};

/** Opens the idempotent attempt of one request (decision 0009 §3). */
export const beginIdempotentAttempt = async (args: {
  store: IdempotencyStore;
  principalKey: string;
  endpointId: string;
  idempotencyKey: string;
  input: { params: unknown; query: unknown; body: unknown };
}): Promise<IdempotentAttempt> => {
  const scopeKey = idempotencyScopeKey({ principalKey: args.principalKey, endpointId: args.endpointId, idempotencyKey: args.idempotencyKey });
  const begin = await args.store.begin(scopeKey, hashRequest(args.input));
  return {
    begin,
    finish: async (response) =>
      response.status >= 500 ? args.store.release(scopeKey) : args.store.complete(scopeKey, await toStored(response)),
    abandon: () => args.store.release(scopeKey),
  };
};

/** Rebuilds a stored response, marked with `Idempotent-Replayed: true`. */
export const replayResponse = (stored: StoredResponse): Response => {
  const headers: Record<string, string> = { "cache-control": "no-store", "idempotent-replayed": "true" };
  if (stored.body !== null) headers["content-type"] = "application/json";
  if (stored.location !== undefined) headers["location"] = stored.location;
  return new Response(stored.body, { status: stored.status, headers });
};
