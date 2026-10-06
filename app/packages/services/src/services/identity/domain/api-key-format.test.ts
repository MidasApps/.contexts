import { ApiKeyPublicIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { formatApiKey, generateApiKeyParts, parseApiKey } from "./api-key-format.ts";

const bytes = (fill: number) => (size: number) => new Uint8Array(size).fill(fill);

describe("API key format", () => {
  it("generates a 12-char base32 publicId and a 43-char base64url secret", () => {
    const parts = generateApiKeyParts(bytes(0xab));
    expect(ApiKeyPublicIdSchema.safeParse(parts.publicId).success).toBe(true);
    expect(parts.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("round-trips format and parse, even when the secret contains underscores", () => {
    const secret = "q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0_-_";
    const key = formatApiKey({ prefix: "core", publicId: "K7QX2M4PZ6AB", secret });
    expect(key).toBe(`core_K7QX2M4PZ6AB_${secret}`);
    expect(parseApiKey(key, "core")).toEqual({ prefix: "core", publicId: "K7QX2M4PZ6AB", secret });
  });

  it("rejects a wrong prefix, a malformed publicId or a short secret", () => {
    const secret = "q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C";
    expect(parseApiKey(`acme_K7QX2M4PZ6AB_${secret}`, "core")).toBeNull();
    expect(parseApiKey(`core_k7qx2m4pz6ab_${secret}`, "core")).toBeNull();
    expect(parseApiKey("core_K7QX2M4PZ6AB_short", "core")).toBeNull();
    expect(parseApiKey(`core_K7QX2M4PZ6AB_${secret}x`, "core")).toBeNull();
  });
});
