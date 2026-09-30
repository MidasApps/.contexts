import type { RateLimitDecision } from "../rate-limit/fixed-window.ts";
import type { RateLimitPolicy } from "../rate-limit/rate-limit-policies.ts";
import type { RateLimiter } from "../rate-limit/rate-limiter.ts";

/**
 * One policy applied to one subject in the pipeline: `before` runs ahead of the work
 * (a hit for request-counted policies, a peek for failure-counted ones); `after` counts
 * a failure-counted policy when the work failed.
 */
export type RateLimitGate = {
  readonly before: () => Promise<RateLimitDecision>;
  readonly after: (failed: boolean) => Promise<RateLimitDecision | undefined>;
};

export const createRateLimitGate = (args: { limiter: RateLimiter; policy: RateLimitPolicy; subject: string }): RateLimitGate => {
  const { limiter, policy, subject } = args;
  const countsFailures = policy.counts === "failures";
  return {
    before: () => (countsFailures ? limiter.peek(policy.id, subject) : limiter.consume(policy.id, subject)),
    after: async (failed) => (countsFailures && failed ? limiter.consume(policy.id, subject) : undefined),
  };
};

/** Failure = a 4xx the caller caused (bad code, bad key), except 429 which was not counted work. */
export const isCallerFailure = (status: number): boolean => status >= 400 && status < 500 && status !== 429;
