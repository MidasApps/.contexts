import { OrganizationIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { emulatorFirebase } from "#/services/shared/testing/core-server-emulator.fixture.ts";
import { ClaimsTooLargeError, createFirebaseClaimsWriter, MAX_CLAIMS_BYTES } from "./firebase-claims-writer.ts";

// Runs inside `firebase emulators:exec`, which exports FIREBASE_AUTH_EMULATOR_HOST.
const { auth } = emulatorFirebase();
const writer = createFirebaseClaimsWriter({ auth });

const freshUser = async (claims: Record<string, unknown>) => {
  const uid = `claims-${crypto.randomUUID()}`;
  await auth.createUser({ uid });
  await auth.setCustomUserClaims(uid, claims);
  return uid;
};

describe("Firebase claims writer", () => {
  it("replaces the core claims and keeps the claims it does not own", async () => {
    const uid = await freshUser({
      principalType: "device",
      smfa: true,
      tenantId: "old-org",
      accessVersion: 1,
      platformRole: "platform-admin",
    });

    await writer.writeClaims(uid, { accessVersion: 2, tenantId: OrganizationIdSchema.parse("org-a") });

    const claims = (await auth.getUser(uid)).customClaims;
    expect(claims).toEqual({ principalType: "device", smfa: true, tenantId: "org-a", accessVersion: 2 });
    expect(Buffer.byteLength(JSON.stringify(claims), "utf8")).toBeLessThan(MAX_CLAIMS_BYTES);
  });

  it("refuses a result of 1000 bytes or more and leaves the claims untouched", async () => {
    const uid = await freshUser({ note: "x".repeat(975) });
    await expect(writer.writeClaims(uid, { accessVersion: 1 })).rejects.toBeInstanceOf(ClaimsTooLargeError);
    expect((await auth.getUser(uid)).customClaims).toEqual({ note: "x".repeat(975) });
  });
});
