import { errorResponse } from "../http/error-envelope.ts";
import type { RateLimitDecision } from "./fixed-window.ts";

const MS_PER_SECOND = 1000;

/**
 * Rate limit headers of `contracts/api.md` §11.2: limit, remaining, reset as Unix
 * seconds, plus `Retry-After` (whole seconds, at least 1) when the hit was refused.
 */
export const rateLimitHeaders = (decision: RateLimitDecision, now: Date): Record<string, string> => {
  const resetMs = decision.resetAt.getTime();
  const headers: Record<string, string> = {
    "x-ratelimit-limit": String(decision.limit),
    "x-ratelimit-remaining": String(decision.remaining),
    "x-ratelimit-reset": String(Math.ceil(resetMs / MS_PER_SECOND)),
  };
  if (decision.allowed) return headers;
  return { ...headers, "retry-after": String(Math.max(1, Math.ceil((resetMs - now.getTime()) / MS_PER_SECOND))) };
};

/** `429 RATE_LIMITED` with the canonical envelope and the rate limit headers. */
export const rateLimitedResponse = (args: { decision: RateLimitDecision; now: Date; requestId: string }): Response => {
  const response = errorResponse({ status: 429, code: "RATE_LIMITED", message: "Too many requests.", requestId: args.requestId });
  for (const [name, value] of Object.entries(rateLimitHeaders(args.decision, args.now))) response.headers.set(name, value);
  return response;
};
