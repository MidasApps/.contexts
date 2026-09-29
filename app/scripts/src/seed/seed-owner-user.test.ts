import { describe, expect, it } from "vitest";
import type { AuthAdmin, AuthUser, AuthUserInput } from "./auth-admin.ts";
import { upsertOwnerUser } from "./seed-owner-user.ts";

type StoredUser = AuthUser & { password: string };

const makeInMemoryAuthAdmin = (): AuthAdmin & { users: StoredUser[] } => {
  const users: StoredUser[] = [];
  return {
    users,
    findUserByEmail: (email) => Promise.resolve(users.find((user) => user.email === email)),
    createUser: (input: AuthUserInput) => {
      const user = { localId: `uid-${users.length + 1}`, ...input };
      users.push(user);
      return Promise.resolve(user);
    },
    updateUser: (localId, input) => {
      const index = users.findIndex((user) => user.localId === localId);
      const updated = { ...users[index], ...input, localId } as StoredUser;
      users[index] = updated;
      return Promise.resolve(updated);
    },
  };
};

const OWNER = { email: "owner@demo.local", password: "local-password", displayName: "Demo Owner" };

describe("upsertOwnerUser", () => {
  it("creates the owner with a verified email on the first run", async () => {
    const auth = makeInMemoryAuthAdmin();
    const result = await upsertOwnerUser(auth, OWNER);
    expect(result).toMatchObject({ action: "created", user: { email: "owner@demo.local", emailVerified: true } });
    expect(auth.users).toHaveLength(1);
  });

  it("converges an existing owner instead of creating a second one", async () => {
    const auth = makeInMemoryAuthAdmin();
    await upsertOwnerUser(auth, OWNER);
    auth.users[0] = { ...auth.users[0]!, displayName: "Renamed", emailVerified: false, password: "changed" };

    const result = await upsertOwnerUser(auth, OWNER);

    expect(result).toMatchObject({ action: "updated", user: { localId: "uid-1", displayName: "Demo Owner", emailVerified: true } });
    expect(auth.users).toEqual([expect.objectContaining({ localId: "uid-1", password: "local-password" })]);
  });
});
