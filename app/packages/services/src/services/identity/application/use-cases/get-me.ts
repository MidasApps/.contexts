import type { Me, User, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { AccountMissingError } from "../../domain/errors/account-missing-error.ts";
import { toMe, type MeDeps } from "../me-deps.ts";
import type { AuthAccount } from "../ports/driven/auth-account-reader.ts";

export type GetMe = (command: { readonly actor: UserPrincipal }) => Promise<Result<Me, AccountMissingError>>;

type Deps = Pick<MeDeps, "users" | "accounts" | "staff" | "clock" | "access" | "mayCreateOrganization">;

/** The Auth account of the caller and their users doc, created on the first call. */
export const loadMe = async (deps: Deps, actor: UserPrincipal): Promise<Result<{ user: User; account: AuthAccount }, AccountMissingError>> => {
  const account = await deps.accounts.getAccount(actor.uid);
  if (account === null) return err(new AccountMissingError());
  const user = await deps.users.ensure({ uid: actor.uid, profile: account.profile, now: deps.clock.now().toISOString() });
  return ok({ user, account });
};

/**
 * Builds `Me` from the users doc, the staff doc (active only), the MFA enrollment and what the
 * caller may start (own access scope: the seed calls `getMe` outside the `/v1` pipeline).
 */
export const describeMe = async (
  deps: Pick<MeDeps, "staff" | "access" | "mayCreateOrganization">,
  actor: UserPrincipal,
  user: User,
  account: AuthAccount,
): Promise<Me> => {
  const [staff, createOrganization] = await Promise.all([
    deps.staff.getPlatformStaff(user.id),
    deps.mayCreateOrganization({ actor, access: deps.access.forRequest() }),
  ]);
  return toMe(user, { platformRole: staff?.isActive === true ? staff.role : null, mfaEnrolled: account.mfaEnrolled, capabilities: { createOrganization } });
};

/**
 * `GET /v1/me` (SP1 spec §7.3): creates `users/{uid}` from the Auth account on the first
 * call (idempotent), then answers profile, preferences, staff flags, MFA enrollment,
 * capabilities (decision 0048) and `accessVersion` (the client re-syncs claims when it is newer
 * than its token's).
 */
export const makeGetMe =
  (deps: Deps): GetMe =>
  async ({ actor }) => {
    const loaded = await loadMe(deps, actor);
    if (!loaded.ok) return loaded;
    return ok(await describeMe(deps, actor, loaded.data.user, loaded.data.account));
  };
