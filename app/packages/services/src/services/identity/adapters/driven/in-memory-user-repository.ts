import { DEFAULT_USER_PREFERENCES, type User } from "@core/contracts";
import type { UserRepository } from "../../application/ports/driven/user-repository.ts";

export type InMemoryUserRepository = UserRepository & {
  readonly userOf: (uid: string) => User | undefined;
  readonly put: (user: User) => void;
};

/** In-memory `UserRepository` for unit tests; transactions are ignored. */
export const createInMemoryUserRepository = (): InMemoryUserRepository => {
  const users = new Map<string, User>();
  return {
    get: (_tx, uid) => Promise.resolve(users.get(uid) ?? null),
    // `put` may store a partial doc (tests of the fail-safe default).
    getRegionalPreferences: (uid) => Promise.resolve((users.get(uid) as Partial<User> | undefined)?.preferences),
    ensure: ({ uid, profile, now }) => {
      const existing = users.get(uid);
      if (existing !== undefined) return Promise.resolve(existing);
      const created: User = {
        id: uid,
        ...profile,
        preferences: DEFAULT_USER_PREFERENCES,
        lastContext: {},
        accessVersion: 0,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      users.set(uid, created);
      return Promise.resolve(created);
    },
    updateProfile: (_tx, { uid, patch, updatedAt }) => {
      const current = users.get(uid);
      if (current === undefined) return;
      const { photoUrl, ...rest } = patch;
      const next: User = { ...current, ...rest, updatedAt };
      if (photoUrl === null) delete next.photoUrl;
      else if (photoUrl !== undefined) next.photoUrl = photoUrl;
      users.set(uid, next);
    },
    setActiveOrganization: (_tx, { uid, organizationId, updatedAt }) => {
      const current = users.get(uid);
      if (current !== undefined) users.set(uid, { ...current, lastContext: { organizationId }, updatedAt });
    },
    userOf: (uid) => users.get(uid),
    put: (user) => void users.set(user.id, user),
  };
};
