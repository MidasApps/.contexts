import { describe, expect, it } from "vitest";
import { groupActivationCode } from "./use-countdown.ts";

describe("create-device-activation", () => {
  it("groups the 8-char code for reading", () => {
    expect(groupActivationCode("7KQ2M9XA")).toBe("7KQ2-M9XA");
    expect(groupActivationCode("ABC")).toBe("ABC");
  });
});
