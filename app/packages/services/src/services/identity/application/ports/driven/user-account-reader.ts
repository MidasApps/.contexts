import type { UserId } from "@core/contracts";
import type { NewUserProfile } from "../../../../access/application/ports/driven/user-access-version.ts";

/**
 * Reads the Firebase Auth account of a user, for the profile a new `users/{uid}` doc
 * starts with (`createOrganization` makes sure the doc exists; SP1 Task 12 on `GET /v1/me`).
 */
export type UserAccountReader = {
  /** @returns null when the account does not exist or has no email. */
  readonly getProfile: (uid: UserId) => Promise<NewUserProfile | null>;
};
