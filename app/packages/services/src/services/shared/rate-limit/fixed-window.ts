import type { RateLimitPolicy } from "./rate-limit-policies.ts";

/** Counter of one policy + subject inside the current window. */
export type BucketState = { readonly count: number; readonly windowStart: Date };

/** Outcome of one check: `resetAt` is when the current window ends. */
export type RateLimitDecision = {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: Date;
};

/**
 * Fixed-window counting shared by every limiter adapter (decision 0009 §1).
 * A refused hit is not counted, and a peek never writes.
 * @returns the decision and the bucket to store, or `next: null` when nothing changes.
 */
export const applyFixedWindow = (args: {
  bucket: BucketState | null;
  policy: RateLimitPolicy;
  now: Date;
  consume: boolean;
}): { decision: RateLimitDecision; next: BucketState | null } => {
  const { bucket, policy, now } = args;
  const windowOpen = bucket !== null && now.getTime() < bucket.windowStart.getTime() + policy.windowMs;
  const current: BucketState = windowOpen ? bucket : { count: 0, windowStart: now };
  const resetAt = new Date(current.windowStart.getTime() + policy.windowMs);
  const underLimit = current.count < policy.limit;
  if (!args.consume || !underLimit) {
    return {
      decision: { allowed: underLimit, limit: policy.limit, remaining: Math.max(0, policy.limit - current.count), resetAt },
      next: null,
    };
  }
  const next: BucketState = { count: current.count + 1, windowStart: current.windowStart };
  return { decision: { allowed: true, limit: policy.limit, remaining: policy.limit - next.count, resetAt }, next };
};
