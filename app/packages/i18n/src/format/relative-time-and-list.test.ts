import { describe, expect, it } from "vitest";
import { formatList } from "./list.ts";
import { formatRelativeTime } from "./relative-time.ts";

const now = "2026-01-15T12:00:00.000Z";

describe("formatRelativeTime", () => {
  it("picks the largest fitting unit", () => {
    expect(formatRelativeTime("2026-01-15T11:59:30.000Z", { now, locale: "en-US" })).toBe("30 seconds ago");
    expect(formatRelativeTime("2026-01-15T09:00:00.000Z", { now, locale: "en-US" })).toBe("3 hours ago");
    expect(formatRelativeTime("2026-01-12T12:00:00.000Z", { now, locale: "pt-BR" })).toBe("há 3 dias");
    expect(formatRelativeTime("2026-01-16T12:00:00.000Z", { now, locale: "en-US" })).toBe("tomorrow");
    expect(formatRelativeTime("2025-01-15T12:00:00.000Z", { now, locale: "en-US" })).toBe("last year");
  });
});

describe("formatList", () => {
  it("joins items with locale conjunctions", () => {
    expect(formatList(["A", "B", "C"], { locale: "pt-BR" })).toBe("A, B e C");
    expect(formatList(["A", "B"], { locale: "en-US", type: "disjunction" })).toBe("A or B");
  });
});
