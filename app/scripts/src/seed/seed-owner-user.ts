import type { AuthAdmin, AuthUser } from "./auth-admin.ts";
import type { SeedOwner } from "./seed-target.ts";

export type UpsertOwnerResult = { action: "created" | "updated"; user: AuthUser };

/**
 * Idempotent: creates the owner on the first run; later runs reset the password,
 * display name and verified flag to the seeded values instead of failing on
 * EMAIL_EXISTS, so `pnpm seed:local` can run any number of times.
 */
export const upsertOwnerUser = async (auth: AuthAdmin, owner: SeedOwner): Promise<UpsertOwnerResult> => {
  const input = { ...owner, emailVerified: true };
  const existing = await auth.findUserByEmail(owner.email);
  if (existing === undefined) return { action: "created", user: await auth.createUser(input) };
  return { action: "updated", user: await auth.updateUser(existing.localId, input) };
};
