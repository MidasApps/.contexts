import type { Principal } from "@core/contracts";
import { isApiKeyCredential, parseBearer, requiresRevocationCheck, type VerifyBearer } from "../../identity/application/use-cases/resolve-principal.ts";
import type { RateLimitDecision } from "../rate-limit/fixed-window.ts";
import { getRateLimitPolicy, type RateLimitPolicy } from "../rate-limit/rate-limit-policies.ts";
import type { RateLimiter } from "../rate-limit/rate-limiter.ts";
import { createRateLimitGate } from "./api-rate-limit.ts";

export type Authentication =
  | { readonly kind: "principal"; readonly principal: Principal }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "rate-limited"; readonly decision: RateLimitDecision };

const API_KEY_FAILURE_POLICY = "api-key-failure";

/**
 * Authenticates a `/v1` request from `Authorization: Bearer` only (SP1 spec §3.2).
 * API keys are locked out per IP after repeated failures: a slot is reserved before the key
 * is hashed and given back on success (decisions 0008 §5, 0030 §1); ID tokens are verified
 * with the method's revocation rule.
 */
export const authenticateRequest = async (args: {
  request: Request;
  clientIp: string;
  verifyBearer: VerifyBearer;
  apiKeyPrefix: string;
  rateLimiter: RateLimiter;
  policies?: readonly RateLimitPolicy[] | undefined;
}): Promise<Authentication> => {
  const token = parseBearer(args.request.headers.get("authorization"));
  if (token === null) return { kind: "unauthenticated" };
  const checkRevoked = requiresRevocationCheck(args.request.method);
  if (!isApiKeyCredential(token, args.apiKeyPrefix)) {
    const principal = await args.verifyBearer({ token, checkRevoked });
    return principal === null ? { kind: "unauthenticated" } : { kind: "principal", principal };
  }
  const policy = getRateLimitPolicy(API_KEY_FAILURE_POLICY, args.policies);
  const gate = createRateLimitGate({ limiter: args.rateLimiter, policy, subject: args.clientIp });
  const decision = await gate.before();
  if (!decision.allowed) return { kind: "rate-limited", decision };
  const principal = await args.verifyBearer({ token, checkRevoked });
  await gate.after(principal === null);
  return principal === null ? { kind: "unauthenticated" } : { kind: "principal", principal };
};
