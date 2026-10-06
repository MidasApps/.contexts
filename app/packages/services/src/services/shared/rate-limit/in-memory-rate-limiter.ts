import type { Clock } from "../clock/clock.ts";
import { applyFixedWindow, applyFixedWindowRefund, type BucketState } from "./fixed-window.ts";
import { getRateLimitPolicy, RATE_LIMIT_POLICIES, type RateLimitPolicy } from "./rate-limit-policies.ts";
import { type RateLimiter, rateLimitBucketId } from "./rate-limiter.ts";

/** In-memory `RateLimiter` for unit tests; one process only (never used in a runtime). */
export const createInMemoryRateLimiter = (args: {
  clock: Clock;
  policies?: readonly RateLimitPolicy[];
}): RateLimiter => {
  const buckets = new Map<string, BucketState>();
  const policies = args.policies ?? RATE_LIMIT_POLICIES;
  const hit = (policyId: string, subject: string, consume: boolean) => {
    const policy = getRateLimitPolicy(policyId, policies);
    const id = rateLimitBucketId(policyId, subject);
    const { decision, next } = applyFixedWindow({
      bucket: buckets.get(id) ?? null,
      policy,
      now: args.clock.now(),
      consume,
    });
    if (next !== null) buckets.set(id, next);
    return decision;
  };
  return {
    consume: (policyId, subject) => Promise.resolve().then(() => hit(policyId, subject, true)),
    peek: (policyId, subject) => Promise.resolve().then(() => hit(policyId, subject, false)),
    refund: (policyId, subject, consumed) =>
      Promise.resolve().then(() => {
        const id = rateLimitBucketId(policyId, subject);
        const refunded = applyFixedWindowRefund({
          bucket: buckets.get(id) ?? null,
          policy: getRateLimitPolicy(policyId, policies),
          consumed,
        });
        if (refunded === null) return null;
        buckets.set(id, refunded.next);
        return refunded.decision;
      }),
  };
};
