import type { UserId } from "@core/contracts";
import type { NewUserProfile } from "../../../../access/application/ports/driven/user-access-version.ts";

/** What `GET /v1/me` reads from the Firebase Auth account. */
export type AuthAccount = {
  /** Email, display name and photo a new `users/{uid}` doc starts with. */
  readonly profile: NewUserProfile;
  /** At least one second factor is enrolled (`multiFactor.enrolledFactors`). */
  readonly mfaEnrolled: boolean;
};

/** The Firebase Auth account of the signed-in user (Admin `getUser`). */
export type AuthAccountReader = {
  /** @returns null when the account does not exist or has no email. */
  readonly getAccount: (uid: UserId) => Promise<AuthAccount | null>;
};
