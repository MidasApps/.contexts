import type { UserId } from "@core/contracts";

/** What member lists show about a user. */
export type DirectoryEntry = { readonly displayName: string; readonly email: string };

/** The Firebase Auth account of a user, as invitation acceptance needs it. */
export type DirectoryAccount = DirectoryEntry & { readonly emailVerified: boolean; readonly photoUrl?: string };

/**
 * Profiles of users (SP1 Task 11): the app profile (`users/{uid}`) for lists, the Auth
 * account for the verified email.
 */
export type UserDirectory = {
  /** Entries of the users found; unknown uids are absent from the map. */
  readonly getMany: (uids: readonly UserId[]) => Promise<ReadonlyMap<UserId, DirectoryEntry>>;
  /** @returns null when the Auth account does not exist or has no email. */
  readonly getAccount: (uid: UserId) => Promise<DirectoryAccount | null>;
};
