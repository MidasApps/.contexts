import { describe, expect, it } from "vitest";
import { applyFixedWindow, applyFixedWindowRefund } from "./fixed-window.ts";
import type { RateLimitPolicy } from "./rate-limit-policies.ts";

const policy: RateLimitPolicy = { id: "test-policy", limit: 2, windowMs: 60_000, subject: "ip", counts: "requests" };
const at = (iso: string) => new Date(iso);
const START = at("2026-09-29T12:00:00.000Z");

describe("applyFixedWindow", () => {
  it("opens a window on the first hit", () => {
    const result = applyFixedWindow({ bucket: null, policy, now: START, consume: true });
    expect(result.decision).toEqual({ allowed: true, limit: 2, remaining: 1, resetAt: at("2026-09-29T12:01:00.000Z") });
    expect(result.next).toEqual({ count: 1, windowStart: START });
  });

  it("refuses the hit over the limit without counting it", () => {
    const now = at("2026-09-29T12:00:30.000Z");
    const result = applyFixedWindow({ bucket: { count: 2, windowStart: START }, policy, now, consume: true });
    expect(result.decision).toMatchObject({ allowed: false, remaining: 0 });
    expect(result.next).toBeNull();
  });

  it("starts a new window once the old one elapsed", () => {
    const now = at("2026-09-29T12:01:00.000Z");
    const result = applyFixedWindow({ bucket: { count: 2, windowStart: START }, policy, now, consume: true });
    expect(result.decision).toMatchObject({ allowed: true, remaining: 1, resetAt: at("2026-09-29T12:02:00.000Z") });
    expect(result.next).toEqual({ count: 1, windowStart: now });
  });

  it("peeks without counting", () => {
    const open = applyFixedWindow({ bucket: { count: 1, windowStart: START }, policy, now: START, consume: false });
    expect(open).toEqual({
      decision: { allowed: true, limit: 2, remaining: 1, resetAt: at("2026-09-29T12:01:00.000Z") },
      next: null,
    });
    const full = applyFixedWindow({ bucket: { count: 2, windowStart: START }, policy, now: START, consume: false });
    expect(full.decision.allowed).toBe(false);
  });
});

describe("applyFixedWindowRefund", () => {
  const consumed = { allowed: true, limit: 2, remaining: 0, resetAt: at("2026-09-29T12:01:00.000Z") };

  it("gives one hit back inside the window that counted it", () => {
    const result = applyFixedWindowRefund({ bucket: { count: 2, windowStart: START }, policy, consumed });
    expect(result).toEqual({
      decision: { allowed: true, limit: 2, remaining: 1, resetAt: consumed.resetAt },
      next: { count: 1, windowStart: START },
    });
  });

  it("changes nothing once that window ended or the bucket is empty", () => {
    const later = at("2026-09-29T12:01:00.000Z");
    expect(applyFixedWindowRefund({ bucket: { count: 1, windowStart: later }, policy, consumed })).toBeNull();
    expect(applyFixedWindowRefund({ bucket: { count: 0, windowStart: START }, policy, consumed })).toBeNull();
    expect(applyFixedWindowRefund({ bucket: null, policy, consumed })).toBeNull();
  });
});
