import { InvitationTokenSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { buildAcceptUrl, generateInvitationToken, hashInvitationToken, InvalidRandomBytesError } from "./invitation-token.ts";

const bytes = (fill: number) => () => new Uint8Array(32).fill(fill);

describe("invitation token", () => {
  it("encodes 32 random bytes as a 43-char base64url token the contract accepts", () => {
    const token = generateInvitationToken(bytes(0xab));
    expect(token).toHaveLength(43);
    expect(InvitationTokenSchema.safeParse(token).success).toBe(true);
  });

  it("differs when the random bytes differ", () => {
    expect(generateInvitationToken(bytes(1))).not.toBe(generateInvitationToken(bytes(2)));
  });

  it("refuses a generator that returns fewer than 32 bytes (bug)", () => {
    expect(() => generateInvitationToken(() => new Uint8Array(16))).toThrow(InvalidRandomBytesError);
  });

  it("stores only the sha256 of the token, as lower-case hex", () => {
    const token = generateInvitationToken(bytes(7));
    const hash = hashInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashInvitationToken(token)).toBe(hash);
  });

  it("puts the token in the fragment of `<app>/{locale}/invite`, so it never reaches server logs", () => {
    expect(buildAcceptUrl({ appUrl: "https://app.example.com/", token: "abc", locale: "en-US" })).toBe("https://app.example.com/en-US/invite#token=abc");
    expect(buildAcceptUrl({ appUrl: "https://app.example.com/base", token: "abc", locale: "pt-BR" })).toBe("https://app.example.com/base/pt-BR/invite#token=abc");
  });
});
