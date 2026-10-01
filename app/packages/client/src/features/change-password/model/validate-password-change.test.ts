import { describe, expect, it } from "vitest";
import { validatePasswordChange } from "./validate-password-change.ts";

describe("change-password", () => {
  it("checks presence, length, difference and confirmation", () => {
    expect(validatePasswordChange({ current: "", next: "", confirmation: "" })).toEqual({ current: "required", next: "required", confirmation: "required" });
    expect(validatePasswordChange({ current: "old-password", next: "short", confirmation: "short" })).toEqual({ next: "tooShort" });
    expect(validatePasswordChange({ current: "same-password", next: "same-password", confirmation: "same-password" })).toEqual({ next: "sameAsCurrent" });
    expect(validatePasswordChange({ current: "old-password", next: "new-password", confirmation: "other" })).toEqual({ confirmation: "mismatch" });
    expect(validatePasswordChange({ current: "old-password", next: "new-password", confirmation: "new-password" })).toEqual({});
  });
});
