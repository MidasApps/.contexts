import { describe, expect, it } from "vitest";
import { maskEmail, normalizeEmail, sameEmail } from "./email.ts";

describe("normalizeEmail", () => {
  it("lower-cases and trims", () => {
    expect(normalizeEmail("  Carla@Example.COM ")).toBe("carla@example.com");
  });

  it("composes to NFC, so decomposed and precomposed forms compare equal", () => {
    const decomposed = "josé@example.com";
    const precomposed = "josé@example.com";
    expect(normalizeEmail(decomposed)).toBe(precomposed);
    expect(sameEmail(decomposed.toUpperCase(), precomposed)).toBe(true);
  });

  it("tells different addresses apart", () => {
    expect(sameEmail("carla@example.com", "carlos@example.com")).toBe(false);
  });
});

describe("maskEmail", () => {
  it("keeps the first character of the local part and the domain", () => {
    expect(maskEmail("carla@example.com")).toBe("c***@example.com");
  });

  it("masks a one-character local part too", () => {
    expect(maskEmail("c@example.com")).toBe("c***@example.com");
  });
});
