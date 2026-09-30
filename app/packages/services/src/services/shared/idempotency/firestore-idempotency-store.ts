import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { systemClock, type Clock } from "../clock/clock.ts";
import { CorruptDocumentError } from "../firestore/corrupt-document-error.ts";
import { runInTransaction } from "../firestore/transaction-runner.ts";
import { decideBegin, type IdempotencyRecord, type StoredResponse } from "./idempotency-decision.ts";
import type { IdempotencyStore } from "./idempotency-store.ts";

/** One document per scope key (decision 0009 §3); `expiresAt` carries a TTL policy. */
export const IDEMPOTENCY_RECORDS_COLLECTION = "idempotency-records";

const StoredResponseSchema = z.object({
  status: z.int().min(100).max(599),
  body: z.string().nullable(),
  location: z.string().optional(),
});

const StoredRecordSchema = z.object({
  requestHash: z.string().min(1),
  state: z.enum(["in-flight", "done"]),
  response: StoredResponseSchema.nullable(),
  expiresAt: z.instanceof(Timestamp),
  leaseUntil: z.instanceof(Timestamp),
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
    response === null ? null : { status: response.status, body: response.body, ...(response.location === undefined ? {} : { location: response.location }) };
  return { ...rest, response: storedResponse, expiresAt: expiresAt.toDate(), leaseUntil: leaseUntil.toDate() };
};

const toStored = (record: IdempotencyRecord) => ({
  requestHash: record.requestHash,
  state: record.state,
  response: record.response,
  expiresAt: Timestamp.fromDate(record.expiresAt),
  leaseUntil: Timestamp.fromDate(record.leaseUntil),
});

/**
 * Firestore `IdempotencyStore` (decision 0009 §3): `begin`, `complete` and `release` run
 * in transactions on `idempotency-records/{scopeKey}`. Response bodies are kept as JSON
 * text for 24 h, then the TTL policy deletes them.
 */
export const createFirestoreIdempotencyStore = (deps: { firestore: Firestore; clock?: Clock }): IdempotencyStore => {
  const clock = deps.clock ?? systemClock;
  const refOf = (scopeKey: string) => deps.firestore.collection(IDEMPOTENCY_RECORDS_COLLECTION).doc(scopeKey);
  return {
    begin: (scopeKey, requestHash) => {
      const ref = refOf(scopeKey);
      return runInTransaction(deps.firestore, async (tx) => {
        const record = readRecord(ref, (await tx.get(ref)).data());
        const { begin, write } = decideBegin({ record, requestHash, now: clock.now() });
        if (write !== null) tx.set(ref, toStored(write));
        return begin;
      });
    },
    complete: (scopeKey, response) => {
      const ref = refOf(scopeKey);
      return runInTransaction(deps.firestore, async (tx) => {
        const record = readRecord(ref, (await tx.get(ref)).data());
        // A record the TTL already removed cannot be completed; the next retry starts over.
        if (record !== null) tx.set(ref, toStored({ ...record, state: "done", response }));
      });
    },
    release: (scopeKey) => {
      const ref = refOf(scopeKey);
      return runInTransaction(deps.firestore, async (tx) => {
        const record = readRecord(ref, (await tx.get(ref)).data());
        if (record?.state === "in-flight") tx.delete(ref);
      });
    },
  };
};
