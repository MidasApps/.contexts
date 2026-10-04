import { randomUUID } from "node:crypto";
import { type DocumentReference, type Firestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { type Clock, systemClock } from "../clock/clock.ts";
import { CorruptDocumentError } from "../firestore/corrupt-document-error.ts";
import { runInTransaction } from "../firestore/transaction-runner.ts";
import { decideBegin, type IdempotencyRecord, ownsAttempt, type StoredResponse } from "./idempotency-decision.ts";
import type { IdempotencyStore } from "./idempotency-store.ts";

/** One document per scope key (decision 0009 §3); `expiresAt` carries a TTL policy. */
export const IDEMPOTENCY_RECORDS_COLLECTION = "idempotency-records";

const StoredResponseSchema = z.object({
  status: z.int().min(100).max(599),
  body: z.string().nullable(),
  location: z.string().optional(),
  redacted: z.boolean().optional(),
});

const StoredRecordSchema = z.object({
  requestHash: z.string().min(1),
  state: z.enum(["in-flight", "done"]),
  response: StoredResponseSchema.nullable(),
  expiresAt: z.instanceof(Timestamp),
  leaseUntil: z.instanceof(Timestamp),
  // Records written before attempt ids existed match no attempt; they expire with the TTL.
  attemptId: z.string().default(""),
});

const readRecord = (ref: DocumentReference, data: unknown): IdempotencyRecord | null => {
  if (data === undefined) return null;
  const parsed = StoredRecordSchema.safeParse(data);
  if (!parsed.success) {
    const issuePaths = [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))];
    throw new CorruptDocumentError({ documentPath: ref.path, issuePaths });
  }
  const { response, expiresAt, leaseUntil, ...rest } = parsed.data;
  const storedResponse: StoredResponse | null =
    response === null
      ? null
      : {
          status: response.status,
          body: response.body,
          ...(response.location === undefined ? {} : { location: response.location }),
          ...(response.redacted === true ? { redacted: true } : {}),
        };
  return { ...rest, response: storedResponse, expiresAt: expiresAt.toDate(), leaseUntil: leaseUntil.toDate() };
};

const toStored = (record: IdempotencyRecord) => ({
  requestHash: record.requestHash,
  state: record.state,
  response: record.response,
  expiresAt: Timestamp.fromDate(record.expiresAt),
  leaseUntil: Timestamp.fromDate(record.leaseUntil),
  attemptId: record.attemptId,
});

/**
 * Firestore `IdempotencyStore` (decision 0009 §3): `begin`, `complete` and `release` run
 * in transactions on `idempotency-records/{scopeKey}`. Response bodies are kept as JSON
 * text for 24 h, then the TTL policy deletes them.
 */
export const createFirestoreIdempotencyStore = (deps: {
  firestore: Firestore;
  clock?: Clock;
  newAttemptId?: () => string;
}): IdempotencyStore => {
  const clock = deps.clock ?? systemClock;
  const newAttemptId = deps.newAttemptId ?? randomUUID;
  const refOf = (scopeKey: string) => deps.firestore.collection(IDEMPOTENCY_RECORDS_COLLECTION).doc(scopeKey);
  return {
    begin: (scopeKey, requestHash) => {
      const ref = refOf(scopeKey);
      return runInTransaction(deps.firestore, async (tx) => {
        const record = readRecord(ref, (await tx.get(ref)).data());
        const { begin, write } = decideBegin({ record, requestHash, now: clock.now(), attemptId: newAttemptId() });
        if (write !== null) tx.set(ref, toStored(write));
        return begin;
      });
    },
    complete: (scopeKey, attemptId, response) => {
      const ref = refOf(scopeKey);
      return runInTransaction(deps.firestore, async (tx) => {
        const record = readRecord(ref, (await tx.get(ref)).data());
        // Gone (TTL) or taken over by a later attempt: this attempt's result is dropped.
        if (ownsAttempt(record, attemptId)) tx.set(ref, toStored({ ...record, state: "done", response }));
      });
    },
    release: (scopeKey, attemptId) => {
      const ref = refOf(scopeKey);
      return runInTransaction(deps.firestore, async (tx) => {
        const record = readRecord(ref, (await tx.get(ref)).data());
        if (ownsAttempt(record, attemptId)) tx.delete(ref);
      });
    },
  };
};
