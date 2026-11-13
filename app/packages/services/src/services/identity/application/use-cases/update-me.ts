import type { Me, UpdateMeInput, User, UserPreferences, UserPrincipal } from "@core/contracts";
import { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { AccountMissingError } from "../../domain/errors/account-missing-error.ts";
import type { MeDeps } from "../me-deps.ts";
import type { UserProfilePatch } from "../ports/driven/user-repository.ts";
import { describeMe, loadMe } from "./get-me.ts";

export type UpdateMeCommand = { readonly actor: UserPrincipal; readonly input: UpdateMeInput };

export type UpdateMe = (command: UpdateMeCommand) => Promise<Result<Me, AccessDeniedError | AccountMissingError>>;

const REGIONAL_KEYS = ["locale", "timeZone", "currency"] as const;

/** New preferences: `null` removes a regional preference (fall back to the node's). */
export const applyPreferencesPatch = (
  current: UserPreferences,
  patch: NonNullable<UpdateMeInput["preferences"]>,
): UserPreferences => {
  const next: UserPreferences = { ...current, notifications: { ...current.notifications } };
  for (const key of REGIONAL_KEYS) {
    const value = patch[key];
    if (value === null) delete next[key];
    else if (value !== undefined) Object.assign(next, { [key]: value });
  }
  if (patch.theme !== undefined) next.theme = patch.theme;
  if (patch.notifications !== undefined)
    next.notifications = { ...next.notifications, productUpdates: patch.notifications.productUpdates };
  return next;
};

const profilePatchOf = (user: User, input: UpdateMeInput): UserProfilePatch => ({
  ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
  ...(input.photoUrl === undefined ? {} : { photoUrl: input.photoUrl }),
  ...(input.preferences === undefined
    ? {}
    : { preferences: applyPreferencesPatch(user.preferences, input.preferences) }),
});

const applied = (user: User, patch: UserProfilePatch, updatedAt: string): User => {
  const { photoUrl, ...rest } = patch;
  const next: User = { ...user, ...rest, updatedAt };
  if (photoUrl === null) delete next.photoUrl;
  else if (photoUrl !== undefined) next.photoUrl = photoUrl;
  return next;
};

/**
 * `PATCH /v1/me`: display name, photo and preferences of the caller (the time zone is an
 * IANA name, validated at the boundary). Refused under impersonation (read-only).
 */
export const makeUpdateMe =
  (
    deps: Pick<
      MeDeps,
      | "users"
      | "accounts"
      | "staff"
      | "clock"
      | "unitOfWork"
      | "access"
      | "mayCreateOrganization"
      | "organizationDefaultProject"
      | "membership"
    >,
  ): UpdateMe =>
  async ({ actor, input }) => {
    if (actor.impersonation !== undefined) return err(new AccessDeniedError("IMPERSONATION_READ_ONLY"));
    const loaded = await loadMe(deps, actor);
    if (!loaded.ok) return loaded;
    const updatedAt = deps.clock.now().toISOString();
    const user = await deps.unitOfWork.run(async (tx) => {
      const current = (await deps.users.get(tx, actor.uid)) ?? loaded.data.user;
      const patch = profilePatchOf(current, input);
      deps.users.updateProfile(tx, { uid: actor.uid, patch, updatedAt, actorId: actor.uid });
      return applied(current, patch, updatedAt);
    });
    return ok(await describeMe(deps, actor, user, loaded.data.account));
  };
