import { sha256Hex } from "../crypto/sha256.ts";
import type { RateLimitDecision } from "./fixed-window.ts";

export type { RateLimitDecision } from "./fixed-window.ts";

/**
 * Port of the rate limiter (decision 0009). `subject` is an IP or a principal key;
 * adapters store only its hash.
 */
export type RateLimiter = {
  /** Counts one hit; a refused hit is not counted. */
  readonly consume: (policyId: string, subject: string) => Promise<RateLimitDecision>;
  /** Reads the bucket without counting (failure-counted policies check before acting). */
  readonly peek: (policyId: string, subject: string) => Promise<RateLimitDecision>;
};

/** Opaque bucket id: `sha256(policyId + ":" + subject)`, so no IP or uid is stored in clear. */
export const rateLimitBucketId = (policyId: string, subject: string): string => sha256Hex(`${policyId}:${subject}`);
