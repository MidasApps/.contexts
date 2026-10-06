// Test world of the `/v1/me*` use cases: the tenancy world (in-memory organizations,
// projects, units, grants and projections) plus an in-memory users store and Auth accounts.
import type { User } from "@core/contracts";
import { makeTenancyWorld } from "#/services/tenancy/application/use-cases/tenancy.fixture.ts";
import { createInMemoryUserRepository } from "../../adapters/driven/in-memory-user-repository.ts";
import { createIdentityServices } from "../../composition.ts";
import type { AuthAccount } from "../ports/driven/auth-account-reader.ts";

export const makeMeWorld = (options: { selfServe?: boolean } = {}) => {
  const world = makeTenancyWorld(options);
  const users = createInMemoryUserRepository();
  const accounts = new Map<string, AuthAccount>();
  const identity = createIdentityServices({
    users,
    accounts: { getAccount: (uid) => Promise.resolve(accounts.get(uid) ?? null) },
    staff: world.store.principals,
    access: world.core,
    projections: world.writes.projections,
    membership: world.services,
    syncClaims: world.deps.syncClaims,
    organizations: world.tenancyStore.organizations,
    loadNode: world.tenancy.loadNode,
    mayCreateOrganization: world.tenancy.mayCreateOrganization,
    audit: world.deps.audit,
    unitOfWork: world.deps.unitOfWork,
    clock: world.deps.clock,
  });
  /** An Auth account (and optionally a users doc with preferences). */
  const account = (uid: string, options: { mfaEnrolled?: boolean; preferences?: User["preferences"] } = {}) => {
    accounts.set(uid, {
      profile: { email: `${uid}@example.com`, displayName: uid },
      mfaEnrolled: options.mfaEnrolled ?? false,
    });
    if (options.preferences !== undefined) {
      users.put({
        id: uid,
        email: `${uid}@example.com`,
        displayName: uid,
        preferences: options.preferences,
        lastContext: {},
        accessVersion: 0,
        status: "active",
        createdAt: "2026-09-30T12:00:00.000Z",
        updatedAt: "2026-09-30T12:00:00.000Z",
      } as User);
    }
  };
  return { ...world, users, identity, account };
};
