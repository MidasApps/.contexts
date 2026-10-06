import { describe, expect, it } from "vitest";
import { rateLimitedResponse, rateLimitHeaders } from "./rate-limit-headers.ts";

const now = new Date("2026-09-29T12:00:00.000Z");
const resetAt = new Date("2026-09-29T12:00:42.500Z");

describe("rate limit headers (contracts/api.md §11.2)", () => {
  it("sets limit, remaining and reset (Unix seconds) on an allowed request", () => {
    expect(rateLimitHeaders({ allowed: true, limit: 10, remaining: 7, resetAt }, now)).toEqual({
      "x-ratelimit-limit": "10",
      "x-ratelimit-remaining": "7",
      "x-ratelimit-reset": String(Math.ceil(resetAt.getTime() / 1000)),
    });
  });

  it("adds Retry-After in whole seconds, at least 1, when refused", () => {
    expect(rateLimitHeaders({ allowed: false, limit: 10, remaining: 0, resetAt }, now)["retry-after"]).toBe("43");
    expect(rateLimitHeaders({ allowed: false, limit: 10, remaining: 0, resetAt: now }, now)["retry-after"]).toBe("1");
  });

  it("answers 429 RATE_LIMITED with the envelope and the headers", async () => {
    const response = rateLimitedResponse({
      decision: { allowed: false, limit: 5, remaining: 0, resetAt },
      now,
      requestId: "req-1",
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("43");
    expect(response.headers.get("x-ratelimit-limit")).toBe("5");
    expect(await response.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests.", requestId: "req-1" },
    });
  });
});
