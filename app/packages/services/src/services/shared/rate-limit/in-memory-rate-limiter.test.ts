import { describe, expect, it } from "vitest";
import type { Clock } from "../clock/clock.ts";
import { createInMemoryRateLimiter } from "./in-memory-rate-limiter.ts";
import type { RateLimitPolicy } from "./rate-limit-policies.ts";

const policies: RateLimitPolicy[] = [
  { id: "two-per-minute", limit: 2, windowMs: 60_000, subject: "ip", counts: "requests" },
  { id: "other", limit: 1, windowMs: 60_000, subject: "principal", counts: "requests" },
];

const movableClock = (iso: string) => {
  let current = Date.parse(iso);
  const clock: Clock = { now: () => new Date(current) };
  return {
    clock,
    advance: (ms: number) => {
      current += ms;
    },
  };
};

describe("in-memory rate limiter", () => {
  it("allows up to the limit, then refuses until the window resets", async () => {
    const { clock, advance } = movableClock("2026-09-29T12:00:00.000Z");
    const limiter = createInMemoryRateLimiter({ clock, policies });
    const hits: boolean[] = [];
    for (let index = 0; index < 3; index += 1) hits.push((await limiter.consume("two-per-minute", "1.2.3.4")).allowed);
    expect(hits).toEqual([true, true, false]);
    advance(60_000);
    expect(await limiter.consume("two-per-minute", "1.2.3.4")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("keeps buckets apart by policy and subject", async () => {
    const { clock } = movableClock("2026-09-29T12:00:00.000Z");
    const limiter = createInMemoryRateLimiter({ clock, policies });
    await limiter.consume("other", "user:a");
    expect((await limiter.consume("other", "user:a")).allowed).toBe(false);
    expect((await limiter.consume("other", "user:b")).allowed).toBe(true);
    expect((await limiter.consume("two-per-minute", "user:a")).allowed).toBe(true);
  });

  it("peeks without counting", async () => {
    const { clock } = movableClock("2026-09-29T12:00:00.000Z");
    const limiter = createInMemoryRateLimiter({ clock, policies });
    await limiter.peek("other", "user:a");
    await limiter.peek("other", "user:a");
    expect((await limiter.consume("other", "user:a")).allowed).toBe(true);
    expect((await limiter.peek("other", "user:a")).allowed).toBe(false);
  });

  it("rejects an unknown policy", async () => {
    const { clock } = movableClock("2026-09-29T12:00:00.000Z");
    await expect(createInMemoryRateLimiter({ clock, policies }).consume("nope", "x")).rejects.toThrow("UNKNOWN_RATE_LIMIT_POLICY");
  });
});
