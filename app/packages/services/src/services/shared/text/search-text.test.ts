import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "./search-text.ts";

describe("normalizeSearchText", () => {
  it("drops accents and case and collapses spaces", () => {
    expect(normalizeSearchText("  André  LIMA ")).toBe("andre lima");
    expect(normalizeSearchText("Çağla Ñandú")).toBe("cagla nandu");
    expect(normalizeSearchText("")).toBe("");
  });
});
