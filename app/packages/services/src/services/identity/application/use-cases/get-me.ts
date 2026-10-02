import type { Me, User, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { AccountMissingError } from "../../domain/errors/account-missing-error.ts";
import { toMe, type MeDeps } from "../me-deps.ts";
import type { AuthAccount } from "../ports/driven/auth-account-reader.ts";

export type GetMe = (command: { readonly actor: UserPrincipal }) => Promise<Result<Me, AccountMissingError>>;

type Deps = Pick<MeDeps, "users" | "accounts" | "staff" | "clock" | "access" | "mayCreateOrganization" | "membership">;

/** The Auth account of the caller and their users doc, created on the first call. */
export const loadMe = async (deps: Deps, actor: UserPrincipal): Promise<Result<{ user: User; account: AuthAccount }, AccountMissingError>> => {
  const account = await deps.accounts.getAccount(actor.uid);
  if (account === null) return err(new AccountMissingError());
  const user = await deps.users.ensure({ uid: actor.uid, profile: account.profile, now: deps.clock.now().toISOString() });
  return ok({ user, account });
};

/**
 * The stored `lastContext` while the caller is still a live member of its organization, else
 * empty (UX review U-06): a removed member, or one whose organization was deleted, is sent to
 * the organization list instead of a not-found page that `/` would redirect to again. Answer
 * only: the users doc is rewritten by the next organization switch, so `GET /v1/me` stays safe.
 * Fail-closed like every membership check (a reader error fails the request).
 */
const liveLastContext = async (deps: Pick<MeDeps, "access" | "membership">, actor: UserPrincipal, lastContext: User["lastContext"]): Promise<User["lastContext"]> => {
  const tenantId = lastContext.organizationId;
  if (tenantId === undefined) return lastContext;
  const member = await deps.membership.requireOrganizationMember({ access: deps.access.forRequest(), actor, tenantId });
  return member.ok ? lastContext : {};
};

/**
 * Builds `Me` from the users doc, the staff doc (active only), the MFA enrollment, what the
 * caller may start and its last context if still live (own access scope: the seed calls `getMe`
 * outside the `/v1` pipeline).
 */
export const describeMe = async (
  deps: Pick<MeDeps, "staff" | "access" | "mayCreateOrganization" | "membership">,
  actor: UserPrincipal,
  user: User,
  account: AuthAccount,
): Promise<Me> => {
  const [staff, createOrganization, lastContext] = await Promise.all([
    deps.staff.getPlatformStaff(user.id),
    deps.mayCreateOrganization({ actor, access: deps.access.forRequest() }),
    liveLastContext(deps, actor, user.lastContext),
  ]);
  return toMe({ ...user, lastContext }, { platformRole: staff?.isActive === true ? staff.role : null, mfaEnrolled: account.mfaEnrolled, capabilities: { createOrganization } });
};

/**
 * `GET /v1/me` (SP1 spec §7.3): creates `users/{uid}` from the Auth account on the first
 * call (idempotent), then answers profile, preferences, staff flags, MFA enrollment,
 * capabilities (decision 0050) and `accessVersion` (the client re-syncs claims when it is newer
 * than its token's). `lastContext` is empty once the caller left its organization.
 */
export const makeGetMe =
  (deps: Deps): GetMe =>
  async ({ actor }) => {
    const loaded = await loadMe(deps, actor);
    if (!loaded.ok) return loaded;
    return ok(await describeMe(deps, actor, loaded.data.user, loaded.data.account));
  };
