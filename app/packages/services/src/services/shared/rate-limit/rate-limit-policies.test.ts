import { CORE_ENDPOINTS } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { getRateLimitPolicy, RATE_LIMIT_POLICIES, UnknownRateLimitPolicyError } from "./rate-limit-policies.ts";

const MINUTE = 60_000;

describe("rate limit policies (decision 0009)", () => {
  it("defines the limits of decision 0009 and the claims sync limit", () => {
    const summary = Object.fromEntries(
      RATE_LIMIT_POLICIES.map((policy) => [policy.id, [policy.limit, policy.windowMs, policy.subject, policy.counts]]),
    );
    expect(summary).toEqual({
      "device-redeem": [5, 15 * MINUTE, "ip", "failures"],
      "api-key-failure": [20, MINUTE, "ip", "failures"],
      "desktop-exchange": [10, MINUTE, "ip", "requests"],
      "active-organization-switch": [10, MINUTE, "principal", "requests"],
      "claims-sync": [10, MINUTE, "principal", "requests"],
      "invitation-accept": [20, MINUTE, "principal", "requests"],
      "invitation-preview": [20, MINUTE, "principal", "requests"],
    });
  });

  it("resolves every policy an endpoint descriptor names", () => {
    const named = CORE_ENDPOINTS.flatMap((endpoint) => (endpoint.rateLimit === undefined ? [] : [endpoint.rateLimit]));
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) expect(getRateLimitPolicy(id).id).toBe(id);
  });

  it("limits public endpoints per IP, never per principal", () => {
    for (const endpoint of CORE_ENDPOINTS.filter((candidate) => candidate.auth === "none")) {
      expect(getRateLimitPolicy(endpoint.rateLimit ?? "").subject).toBe("ip");
    }
  });

  it("throws on an unknown policy id (a declaration bug)", () => {
    expect(() => getRateLimitPolicy("nope")).toThrow(UnknownRateLimitPolicyError);
  });
});
