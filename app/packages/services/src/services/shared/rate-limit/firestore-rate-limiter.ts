import { type DocumentReference, type Firestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { type Clock, systemClock } from "../clock/clock.ts";
import { CorruptDocumentError } from "../firestore/corrupt-document-error.ts";
import { runInTransaction } from "../firestore/transaction-runner.ts";
import { applyFixedWindow, applyFixedWindowRefund, type BucketState, type RateLimitDecision } from "./fixed-window.ts";
import { getRateLimitPolicy, RATE_LIMIT_POLICIES, type RateLimitPolicy } from "./rate-limit-policies.ts";
import { type RateLimiter, rateLimitBucketId } from "./rate-limiter.ts";

/** One document per policy + subject (decision 0009 §1); `expiresAt` carries a TTL policy. */
export const RATE_LIMIT_BUCKETS_COLLECTION = "rate-limit-buckets";

const StoredBucketSchema = z.object({
  count: z.int().min(0),
  windowStart: z.instanceof(Timestamp),
});

// Hot buckets see concurrent hits; retry contention a little longer than the default.
const MAX_ATTEMPTS = 10;

const readBucket = (ref: DocumentReference, data: unknown): BucketState | null => {
  if (data === undefined) return null;
  const parsed = StoredBucketSchema.safeParse(data);
  if (!parsed.success) {
    const issuePaths = [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))];
    throw new CorruptDocumentError({ documentPath: ref.path, issuePaths });
  }
  return { count: parsed.data.count, windowStart: parsed.data.windowStart.toDate() };
};

const toStored = (bucket: BucketState, policy: RateLimitPolicy) => ({
  policyId: policy.id,
  count: bucket.count,
  windowStart: Timestamp.fromDate(bucket.windowStart),
  // TTL deletes old buckets; correctness never depends on it (windowStart is checked in code).
  expiresAt: Timestamp.fromMillis(bucket.windowStart.getTime() + policy.windowMs),
});

/**
 * Firestore `RateLimiter` (decision 0009): fixed window counted in a transaction on
 * `rate-limit-buckets/{sha256(policyId:subject)}`, so concurrent hits count exactly.
 */
export const createFirestoreRateLimiter = (deps: {
  firestore: Firestore;
  clock?: Clock;
  policies?: readonly RateLimitPolicy[];
}): RateLimiter => {
  const clock = deps.clock ?? systemClock;
  const policies = deps.policies ?? RATE_LIMIT_POLICIES;
  const refOf = (policyId: string, subject: string) =>
    deps.firestore.collection(RATE_LIMIT_BUCKETS_COLLECTION).doc(rateLimitBucketId(policyId, subject));
  return {
    consume: (policyId, subject) => {
      const policy = getRateLimitPolicy(policyId, policies);
      const ref = refOf(policyId, subject);
      return runInTransaction(
        deps.firestore,
        async (tx): Promise<RateLimitDecision> => {
          const bucket = readBucket(ref, (await tx.get(ref)).data());
          const { decision, next } = applyFixedWindow({ bucket, policy, now: clock.now(), consume: true });
          if (next !== null) tx.set(ref, toStored(next, policy));
          return decision;
        },
        { maxAttempts: MAX_ATTEMPTS },
      );
    },
    refund: (policyId, subject, consumed) => {
      const policy = getRateLimitPolicy(policyId, policies);
      const ref = refOf(policyId, subject);
      return runInTransaction(
        deps.firestore,
        async (tx): Promise<RateLimitDecision | null> => {
          const refunded = applyFixedWindowRefund({
            bucket: readBucket(ref, (await tx.get(ref)).data()),
            policy,
            consumed,
          });
          if (refunded === null) return null;
          tx.set(ref, toStored(refunded.next, policy));
          return refunded.decision;
        },
        { maxAttempts: MAX_ATTEMPTS },
      );
    },
    peek: async (policyId, subject) => {
      const policy = getRateLimitPolicy(policyId, policies);
      const ref = refOf(policyId, subject);
      const bucket = readBucket(ref, (await ref.get()).data());
      return applyFixedWindow({ bucket, policy, now: clock.now(), consume: false }).decision;
    },
  };
};
