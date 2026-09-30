import { sha256Hex } from "../crypto/sha256.ts";
import type { IdempotencyBegin, StoredResponse } from "./idempotency-decision.ts";

export type { IdempotencyBegin, StoredResponse } from "./idempotency-decision.ts";

/**
 * Port of the idempotency store (decision 0009 §3). The pipeline calls `begin` before
 * the handler, then `complete` with the response it sent (status < 500) or `release`
 * (5xx or a throw), so a failed attempt can be retried with the same key. Both take the
 * `attemptId` of `begin` and do nothing once another attempt took the lease over
 * (decision 0030 §5).
 */
export type IdempotencyStore = {
  readonly begin: (scopeKey: string, requestHash: string) => Promise<IdempotencyBegin>;
  readonly complete: (scopeKey: string, attemptId: string, response: StoredResponse) => Promise<void>;
  /** Drops the attempt's in-flight record; a completed one is kept. */
  readonly release: (scopeKey: string, attemptId: string) => Promise<void>;
};

/**
 * Record id: `sha256(principalKey + ":" + endpointId + ":" + idempotencyKey)`, so a key
 * is scoped to one caller and one operation and nothing readable is stored.
 */
export const idempotencyScopeKey = (args: { principalKey: string; endpointId: string; idempotencyKey: string }): string =>
  sha256Hex(`${args.principalKey}:${args.endpointId}:${args.idempotencyKey}`);
