import type { AuthAdmin } from "./auth-admin.ts";
import type { SeedCore, SeedState } from "./seed-core-port.ts";
import { upsertOwnerUser } from "./seed-owner-user.ts";
import type { SeedTarget } from "./seed-target.ts";

/**
 * Test number for the Auth Emulator: no SMS is sent, the code is read from the emulator's
 * `verificationCodes`. Local MFA is SMS because the emulator has no TOTP (decision 0007).
 */
export const SEED_STAFF_PHONE = "+15555550100";

/**
 * `staff@demo.local`: verified account and profile, `platform-admin` through the platform
 * use case (staff doc + `PLATFORM_STAFF_GRANTED` audit entry), and one SMS second factor.
 * Idempotent: the grant is skipped while the role is active, the factor while it is enrolled.
 */
export const seedStaff = async (args: {
  core: SeedCore;
  auth: AuthAdmin;
  target: SeedTarget;
  state: SeedState;
}): Promise<string> => {
  const { core, auth, target, state } = args;
  const { user } = await upsertOwnerUser(auth, target.users.staff);
  state.uids.staff = user.localId;
  await core.ensureProfile(user.localId);
  const changes: string[] = [];
  if ((await core.staffRoleOf(user.localId)) !== "platform-admin") {
    await core.grantStaff({ uid: user.localId, role: "platform-admin" });
    changes.push("granted platform-admin");
  }
  if ((await core.ensurePhoneFactor({ uid: user.localId, phoneNumber: SEED_STAFF_PHONE })) === "enrolled")
    changes.push("enrolled the SMS factor");
  return `${changes.length === 0 ? "unchanged" : changes.join(", ")} (uid ${user.localId})`;
};
