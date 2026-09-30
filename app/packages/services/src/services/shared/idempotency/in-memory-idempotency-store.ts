import type { Clock } from "../clock/clock.ts";
import { decideBegin, ownsAttempt, type IdempotencyRecord } from "./idempotency-decision.ts";
import type { IdempotencyStore } from "./idempotency-store.ts";

/** In-memory `IdempotencyStore` for unit tests (one process only); attempt ids are a sequence. */
export const createInMemoryIdempotencyStore = (args: { clock: Clock }): IdempotencyStore => {
  const records = new Map<string, IdempotencyRecord>();
  let sequence = 0;
  return {
    begin: (scopeKey, requestHash) => {
      sequence += 1;
      const { begin, write } = decideBegin({ record: records.get(scopeKey) ?? null, requestHash, now: args.clock.now(), attemptId: `attempt-${sequence}` });
      if (write !== null) records.set(scopeKey, write);
      return Promise.resolve(begin);
    },
    complete: (scopeKey, attemptId, response) => {
      const record = records.get(scopeKey) ?? null;
      if (ownsAttempt(record, attemptId)) records.set(scopeKey, { ...record, state: "done", response });
      return Promise.resolve();
    },
    release: (scopeKey, attemptId) => {
      if (ownsAttempt(records.get(scopeKey) ?? null, attemptId)) records.delete(scopeKey);
      return Promise.resolve();
    },
  };
};
