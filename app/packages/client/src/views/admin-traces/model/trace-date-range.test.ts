import { describe, expect, it } from "vitest";
import { traceDateRange, validDay } from "./trace-date-range.ts";

describe("traceDateRange", () => {
  it("covers the picked days whole, in the local time zone, with an exclusive end", () => {
    expect(traceDateRange("2026-09-29", "2026-09-30")).toEqual({
      startedAfter: new Date(2026, 8, 29).toISOString(),
      startedBefore: new Date(2026, 9, 1).toISOString(),
    });
  });

  it("takes one bound alone", () => {
    expect(traceDateRange("2026-09-29", undefined)).toEqual({ startedAfter: new Date(2026, 8, 29).toISOString() });
    expect(traceDateRange(undefined, "2026-09-30")).toEqual({ startedBefore: new Date(2026, 9, 1).toISOString() });
    expect(traceDateRange(undefined, undefined)).toEqual({});
  });

  it("ignores days that do not exist, other formats and an end before the start", () => {
    expect(traceDateRange("2026-02-31", "yesterday")).toEqual({});
    expect(validDay("2026-02-31")).toBeUndefined();
    expect(validDay("2026-02-28")).toBe("2026-02-28");
    expect(traceDateRange("2026-09-30", "2026-09-28")).toEqual({ startedAfter: new Date(2026, 8, 30).toISOString() });
  });
});
