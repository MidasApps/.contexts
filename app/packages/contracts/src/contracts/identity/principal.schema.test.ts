import { describe, expect, it } from "vitest";
import { EXAMPLE_IDS } from "../example-values.ts";
import { PrincipalContract, PrincipalSchema } from "./principal.schema.ts";

const {
  user: uid,
  organization: tenantId,
  device: deviceId,
  apiKey: apiKeyId,
  impersonationSession: sessionId,
  otherUser,
} = EXAMPLE_IDS;

describe("PrincipalSchema", () => {
  it("accepts the user, device and service principals of SP1 spec §3.1", () => {
    for (const principal of [
      { type: "user", uid, mfa: false },
      { type: "user", uid, mfa: true, sessionId: EXAMPLE_IDS.session },
      { type: "user", uid, mfa: true, impersonation: { sessionId, staffUid: otherUser } },
      { type: "device", deviceId, tenantId },
      { type: "service", apiKeyId, tenantId, ownerUid: uid },
    ]) {
      expect(PrincipalSchema.parse(principal)).toEqual(principal);
    }
  });

  it("requires mfa on a user and both ids on an impersonation", () => {
    expect(PrincipalSchema.safeParse({ type: "user", uid }).success).toBe(false);
    expect(PrincipalSchema.safeParse({ type: "user", uid, mfa: false, impersonation: { sessionId } }).success).toBe(
      false,
    );
  });

  it("binds device and service principals to a tenant", () => {
    expect(PrincipalSchema.safeParse({ type: "device", deviceId }).success).toBe(false);
    expect(PrincipalSchema.safeParse({ type: "service", apiKeyId, ownerUid: uid }).success).toBe(false);
  });

  it("rejects an unknown type and platform staff as a type (staff is a user)", () => {
    expect(PrincipalSchema.safeParse({ type: "staff", uid, mfa: true }).success).toBe(false);
  });

  it("rejects extra keys, so a principal cannot smuggle a tenant or role", () => {
    expect(PrincipalSchema.safeParse({ type: "user", uid, mfa: false, tenantId }).success).toBe(false);
  });

  it("parses its catalog examples", () => {
    for (const example of PrincipalContract.meta.examples)
      expect(PrincipalSchema.safeParse(example).success).toBe(true);
  });
});
