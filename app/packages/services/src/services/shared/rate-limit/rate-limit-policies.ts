/**
 * Named rate limit policies (decision 0009; SP1 spec §7.3). Endpoint descriptors
 * reference them by id (`rateLimit`), and the `/v1` pipeline applies them:
 * - `subject: "ip"` is counted per client IP, before authentication;
 * - `subject: "principal"` is counted per authenticated principal, after it;
 * - `counts: "failures"` only counts failed attempts (checked before, counted after),
 *   so a legitimate caller is never locked out by its own successes.
 */
export type RateLimitPolicy = {
  readonly id: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly subject: "ip" | "principal";
  readonly counts: "requests" | "failures";
};

const MINUTE_MS = 60_000;

export const RATE_LIMIT_POLICIES = [
  { id: "device-redeem", limit: 5, windowMs: 15 * MINUTE_MS, subject: "ip", counts: "failures" },
  { id: "api-key-failure", limit: 20, windowMs: MINUTE_MS, subject: "ip", counts: "failures" },
  { id: "desktop-exchange", limit: 10, windowMs: MINUTE_MS, subject: "ip", counts: "requests" },
  { id: "active-organization-switch", limit: 10, windowMs: MINUTE_MS, subject: "principal", counts: "requests" },
  // Not in decision 0009's list: same budget as the organization switch (SP1 Tasks 4-6 report).
  { id: "claims-sync", limit: 10, windowMs: MINUTE_MS, subject: "principal", counts: "requests" },
  { id: "invitation-accept", limit: 20, windowMs: MINUTE_MS, subject: "principal", counts: "requests" },
  { id: "invitation-preview", limit: 20, windowMs: MINUTE_MS, subject: "principal", counts: "requests" },
  // SP3 core MCP server (Task 24): one MCP message per request; the budget guard caps model spend.
  { id: "mcp-call", limit: 60, windowMs: MINUTE_MS, subject: "principal", counts: "requests" },
  // SP4 chat (spec §6): 20 turns per minute per user; the 5 concurrent streams per tenant are a
  // concurrency cap checked by `/v1/chat` itself, not a window.
  { id: "chat-turn", limit: 20, windowMs: MINUTE_MS, subject: "principal", counts: "requests" },
  // SP4 voice (spec §4.5): transcriptions, speech and realtime sessions share one budget.
  { id: "voice-call", limit: 30, windowMs: MINUTE_MS, subject: "principal", counts: "requests" },
] as const satisfies readonly RateLimitPolicy[];

export type RateLimitPolicyId = (typeof RATE_LIMIT_POLICIES)[number]["id"];

/** Bug: an endpoint or authenticator names a policy that does not exist. */
export class UnknownRateLimitPolicyError extends Error {
  readonly code = "UNKNOWN_RATE_LIMIT_POLICY";
  readonly policyId: string;

  constructor(policyId: string) {
    super(`UNKNOWN_RATE_LIMIT_POLICY: ${policyId}`);
    this.name = "UnknownRateLimitPolicyError";
    this.policyId = policyId;
  }
}

/**
 * Looks a policy up by id in `policies` (default: the core policies).
 * @throws {UnknownRateLimitPolicyError} when the id is not declared.
 */
export const getRateLimitPolicy = (id: string, policies: readonly RateLimitPolicy[] = RATE_LIMIT_POLICIES): RateLimitPolicy => {
  const policy = policies.find((candidate) => candidate.id === id);
  if (policy === undefined) throw new UnknownRateLimitPolicyError(id);
  return policy;
};
