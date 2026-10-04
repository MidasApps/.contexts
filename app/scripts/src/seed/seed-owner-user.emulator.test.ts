import { afterEach, describe, expect, it } from "vitest";
import { createAuthEmulatorAdmin } from "./auth-emulator-admin.ts";
import { upsertOwnerUser } from "./seed-owner-user.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`), which sets the host.
const AUTH_HOST = process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? "127.0.0.1:9099";
const ORIGIN = `http://${AUTH_HOST}`;
const PROJECT_ID = process.env["GCLOUD_PROJECT"] ?? "demo-core";
// A dedicated address so the test never touches the owner that `pnpm seed:local` creates.
const OWNER = { email: "seed-test-owner@demo.local", password: "seed-test-password", displayName: "Seed Test Owner" };

const deleteAllTestUsers = async (): Promise<void> => {
  const admin = createAuthEmulatorAdmin({ origin: ORIGIN, projectId: PROJECT_ID });
  const user = await admin.findUserByEmail(OWNER.email);
  if (user === undefined) return;
  await fetch(`${ORIGIN}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`, {
    method: "POST",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ localId: user.localId }),
  });
};

const signIn = async (password: string): Promise<number> => {
  const response = await fetch(
    `${ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: OWNER.email, password, returnSecureToken: true }),
    },
  );
  return response.status;
};

afterEach(deleteAllTestUsers);

describe("upsertOwnerUser against the Auth Emulator", () => {
  it("creates the owner once and converges on the second run", async () => {
    const admin = createAuthEmulatorAdmin({ origin: ORIGIN, projectId: PROJECT_ID });

    const first = await upsertOwnerUser(admin, OWNER);
    const second = await upsertOwnerUser(admin, OWNER);

    expect(first.action).toBe("created");
    expect(second).toMatchObject({ action: "updated", user: { localId: first.user.localId, emailVerified: true } });
    expect(await signIn(OWNER.password)).toBe(200);
  });

  it("resets a changed password back to the seeded one", async () => {
    const admin = createAuthEmulatorAdmin({ origin: ORIGIN, projectId: PROJECT_ID });
    const { user } = await upsertOwnerUser(admin, OWNER);
    await admin.updateUser(user.localId, { ...OWNER, password: "someone-changed-it", emailVerified: false });

    await upsertOwnerUser(admin, OWNER);

    expect(await signIn(OWNER.password)).toBe(200);
  });
});
