import type { Clock } from "../clock/clock.ts";
import { decideBegin, type IdempotencyRecord } from "./idempotency-decision.ts";
import type { IdempotencyStore } from "./idempotency-store.ts";

/** In-memory `IdempotencyStore` for unit tests (one process only). */
export const createInMemoryIdempotencyStore = (args: { clock: Clock }): IdempotencyStore => {
  const records = new Map<string, IdempotencyRecord>();
  return {
    begin: (scopeKey, requestHash) => {
      const { begin, write } = decideBegin({ record: records.get(scopeKey) ?? null, requestHash, now: args.clock.now() });
      if (write !== null) records.set(scopeKey, write);
      return Promise.resolve(begin);
    },
    complete: (scopeKey, response) => {
      const record = records.get(scopeKey);
      if (record !== undefined) records.set(scopeKey, { ...record, state: "done", response });
      return Promise.resolve();
    },
    release: (scopeKey) => {
      if (records.get(scopeKey)?.state === "in-flight") records.delete(scopeKey);
      return Promise.resolve();
    },
  };
};
