import { describe, expect, it } from "vitest";
import { budgetUse, recentMonths } from "./budget-level.ts";

describe("budgetUse", () => {
  it("is ok below the threshold, alert from it, over at the cap", () => {
    expect(budgetUse(10, 100, 80)).toEqual({ ratio: 0.1, level: "ok" });
    expect(budgetUse(80, 100, 80)).toEqual({ ratio: 0.8, level: "alert" });
    expect(budgetUse(100, 100, 80)).toEqual({ ratio: 1, level: "over" });
    expect(budgetUse(150, 100, 80).level).toBe("over");
  });

  it("reads a zero cap as over, without a ratio", () => {
    expect(budgetUse(0, 0, 80)).toEqual({ ratio: null, level: "over" });
  });
});

describe("recentMonths", () => {
  it("lists UTC months backwards across the year boundary", () => {
    expect(recentMonths(new Date("2026-02-15T12:00:00.000Z"), 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
});
