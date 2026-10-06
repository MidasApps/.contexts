import { describe, expect, it } from "vitest";
import { CORE_ERROR_CODES, CoreErrorCodeSchema } from "./error-codes.ts";

describe("CORE_ERROR_CODES", () => {
  it("lists distinct SCREAMING_SNAKE codes", () => {
    expect(new Set(CORE_ERROR_CODES).size).toBe(CORE_ERROR_CODES.length);
    for (const code of CORE_ERROR_CODES) expect(code).toMatch(/^[A-Z]+(?:_[A-Z]+)*$/);
  });

  it("has a code for an unavailable upstream service (502/503 from gateways)", () => {
    expect(CoreErrorCodeSchema.safeParse("UPSTREAM_UNAVAILABLE").success).toBe(true);
  });
});
