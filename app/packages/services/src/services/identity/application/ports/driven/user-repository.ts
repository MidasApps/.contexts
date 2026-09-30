import type { OrganizationId, User, UserId, UserPreferences } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { NewUserProfile } from "../../../../access/application/ports/driven/user-access-version.ts";

/** Fields `PATCH /v1/me` rewrites; `photoUrl: null` removes the photo. */
export type UserProfilePatch = {
  readonly displayName?: string;
  readonly photoUrl?: string | null;
  readonly preferences?: UserPreferences;
};

/**
 * `users/{uid}` (SP1 spec §4) as the identity context reads and writes it. Access owns
 * `accessVersion`; identity owns the profile, preferences and `lastContext`.
 */
export type UserRepository = {
  readonly get: (tx: Transaction | undefined, uid: UserId) => Promise<User | null>;
  /**
   * Makes sure the doc exists with every field of the `identity.User` contract: creates it
   * from `profile` on the first `GET /v1/me`, fills fields a partial doc lacks, and keeps
   * every field already there. Idempotent (one transaction).
   * @returns the doc after the call.
   */
  readonly ensure: (args: { uid: UserId; profile: NewUserProfile; now: string }) => Promise<User>;
  readonly updateProfile: (tx: Transaction, args: { uid: UserId; patch: UserProfilePatch; updatedAt: string; actorId: string }) => void;
  /** Sets `lastContext` to the organization alone (project and unit belong to the previous one). */
  readonly setActiveOrganization: (tx: Transaction, args: { uid: UserId; organizationId: OrganizationId; updatedAt: string; actorId: string }) => void;
};
