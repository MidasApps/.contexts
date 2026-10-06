import { describe, expect, it } from "vitest";
import { InvalidRandomBytesError } from "../../access/domain/invitation-token.ts";
import { generateSessionSecret, hashSessionSecret, SESSION_SECRET_BYTES, secretHashesMatch } from "./session-secret.ts";

const bytes = (fill: number) => (size: number) => new Uint8Array(size).fill(fill);

describe("session secret", () => {
  it("encodes 32 random bytes as a 43-char base64url secret", () => {
    const secret = generateSessionSecret(bytes(7));
    expect(SESSION_SECRET_BYTES).toBe(32);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(secret, "base64url")).toEqual(Buffer.alloc(32, 7));
  });

  it("refuses a generator that returns fewer bytes", () => {
    expect(() => generateSessionSecret(() => new Uint8Array(8))).toThrow(InvalidRandomBytesError);
  });

  it("stores the sha256 hex of the secret, never the secret", () => {
    const secret = generateSessionSecret(bytes(1));
    const hash = hashSessionSecret(secret);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(secret);
  });

  it("compares hashes in constant time and refuses different or malformed ones", () => {
    const hash = hashSessionSecret("a");
    expect(secretHashesMatch(hash, hashSessionSecret("a"))).toBe(true);
    expect(secretHashesMatch(hash, hashSessionSecret("b"))).toBe(false);
    expect(secretHashesMatch(hash, "abc")).toBe(false);
    expect(secretHashesMatch("zz", "zz")).toBe(false);
  });
});
