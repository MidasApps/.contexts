import type { RateLimitDecision } from "../rate-limit/fixed-window.ts";
import type { RateLimitPolicy } from "../rate-limit/rate-limit-policies.ts";
import type { RateLimiter } from "../rate-limit/rate-limiter.ts";

/**
 * One policy applied to one subject in the pipeline: `before` counts a hit ahead of the
 * work for every policy; `after` gives the hit of a failure-counted policy back when the
 * work succeeded. Reserving first means a parallel burst of failures cannot all pass the
 * check before any of them is counted (decision 0030 §1). A work that throws keeps its hit.
 */
export type RateLimitGate = {
  readonly before: () => Promise<RateLimitDecision>;
  readonly after: (failed: boolean) => Promise<RateLimitDecision | undefined>;
};

export const createRateLimitGate = (args: { limiter: RateLimiter; policy: RateLimitPolicy; subject: string }): RateLimitGate => {
  const { limiter, policy, subject } = args;
  const countsFailures = policy.counts === "failures";
  let consumed: RateLimitDecision | undefined;
  return {
    before: async () => {
      consumed = await limiter.consume(policy.id, subject);
      return consumed;
    },
    after: async (failed) => {
      if (!countsFailures || failed || consumed?.allowed !== true) return undefined;
      return (await limiter.refund(policy.id, subject, consumed)) ?? undefined;
    },
  };
};

/** Failure = a 4xx the caller caused (bad code, bad key), except 429 which was not counted work. */
export const isCallerFailure = (status: number): boolean => status >= 400 && status < 500 && status !== 429;
