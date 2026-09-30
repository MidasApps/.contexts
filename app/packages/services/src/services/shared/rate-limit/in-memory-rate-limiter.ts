import type { Clock } from "../clock/clock.ts";
import { applyFixedWindow, type BucketState } from "./fixed-window.ts";
import { getRateLimitPolicy, RATE_LIMIT_POLICIES, type RateLimitPolicy } from "./rate-limit-policies.ts";
import { rateLimitBucketId, type RateLimiter } from "./rate-limiter.ts";

/** In-memory `RateLimiter` for unit tests; one process only (never used in a runtime). */
export const createInMemoryRateLimiter = (args: { clock: Clock; policies?: readonly RateLimitPolicy[] }): RateLimiter => {
  const buckets = new Map<string, BucketState>();
  const policies = args.policies ?? RATE_LIMIT_POLICIES;
  const hit = (policyId: string, subject: string, consume: boolean) => {
    const policy = getRateLimitPolicy(policyId, policies);
    const id = rateLimitBucketId(policyId, subject);
    const { decision, next } = applyFixedWindow({ bucket: buckets.get(id) ?? null, policy, now: args.clock.now(), consume });
    if (next !== null) buckets.set(id, next);
    return decision;
  };
  return {
    consume: (policyId, subject) => Promise.resolve().then(() => hit(policyId, subject, true)),
    peek: (policyId, subject) => Promise.resolve().then(() => hit(policyId, subject, false)),
  };
};
