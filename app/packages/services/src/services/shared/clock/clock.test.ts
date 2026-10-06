import { describe, expect, it } from "vitest";
import { fixedClock, isAtOrBefore } from "./clock.ts";

describe("isAtOrBefore", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");

  it("is true for an instant before or equal to now", () => {
    expect(isAtOrBefore("2026-09-29T11:59:59.999Z", now)).toBe(true);
    expect(isAtOrBefore("2026-09-29T12:00:00.000Z", now)).toBe(true);
  });

  it("is false for an instant after now", () => {
    expect(isAtOrBefore("2026-09-29T12:00:00.001Z", now)).toBe(false);
  });

  it("treats an unparsable instant as already passed (fail-closed)", () => {
    expect(isAtOrBefore("not-a-date", now)).toBe(true);
    expect(isAtOrBefore("", now)).toBe(true);
  });
});

describe("fixedClock", () => {
  it("returns a fresh Date at the same instant on every call", () => {
    const clock = fixedClock("2026-09-29T12:00:00.000Z");
    const first = clock.now();
    first.setTime(0);
    expect(clock.now().toISOString()).toBe("2026-09-29T12:00:00.000Z");
  });
});
