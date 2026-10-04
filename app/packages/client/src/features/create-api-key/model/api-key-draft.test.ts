import { describe, expect, it } from "vitest";
import { expiryFrom, validateApiKeyDraft } from "./api-key-draft.ts";

describe("create-api-key", () => {
  it("requires a name and scopes, and computes the expiry from the injected clock", () => {
    expect(
      validateApiKeyDraft({ name: "", node: { level: "organization", tenantId: "o" }, expiryDays: 30, scopes: [] }),
    ).toEqual({ name: "required", scopes: true });
    expect(expiryFrom(new Date("2026-01-01T00:00:00.000Z"), 30)).toBe("2026-01-31T00:00:00.000Z");
  });
});
