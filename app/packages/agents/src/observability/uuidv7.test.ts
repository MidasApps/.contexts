import { describe, expect, it } from "vitest";
import { uuidv7 } from "./uuidv7.ts";

const zeros = (bytes: Uint8Array): void => {
  bytes.fill(0);
};

describe("uuidv7", () => {
  it("puts the Unix milliseconds first, then version 7 and the RFC 9562 variant", () => {
    expect(uuidv7(0x0192_8f6e_7b2a, zeros)).toBe("01928f6e-7b2a-7000-8000-000000000000");
  });

  it("is a valid v7 uuid with random bits by default", () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sorts by creation time", () => {
    expect(uuidv7(1000, zeros) < uuidv7(1001, zeros)).toBe(true);
  });
});
