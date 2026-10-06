import { randomUUID } from "node:crypto";
import { test as base } from "@playwright/test";
import type { V1Client } from "./api.ts";
import { type E2eEnv, readE2eEnv } from "./e2e-env.ts";
import { createEmulatorAuth, type EmulatorAuth } from "./emulator.ts";
import { apiFor, joinOrganization, type RoleRef, readWorld, SEED_USERS, type World } from "./seed-users.ts";

export type FreshUser = { uid: string; email: string; password: string; displayName: string; api: V1Client };

type Fixtures = {
  env: E2eEnv;
  world: World;
  emulator: EmulatorAuth;
  ownerApi: V1Client;
  /**
   * A new account for tests that change a user (preferences, sessions, last context), so parallel
   * browser projects never race on one seeded user. It joins the given organizations through an
   * owner invitation, like a person would; the last one joined is its active organization.
   */
  createUser: (args?: { label?: string; organizations?: { id: string; roles?: RoleRef[] }[] }) => Promise<FreshUser>;
};

const MEMBER: RoleRef[] = [{ kind: "system", key: "member" }];

/**
 * The e2e `test` of one app: env, emulator admin, the owner's `/v1` client, fresh users and the
 * world its setup project wrote to `authDir` (the app's gitignored `e2e/.auth/`).
 */
export const createE2eTest = (options: { authDir: string }) =>
  base.extend<Fixtures>({
    // Playwright fixtures must destructure their dependencies, even when empty.
    // eslint-disable-next-line no-empty-pattern -- fixture signature
    env: async ({}, provide) => {
      await provide(readE2eEnv());
    },
    // eslint-disable-next-line no-empty-pattern -- fixture signature
    world: async ({}, provide) => {
      await provide(readWorld(options.authDir));
    },
    emulator: async ({ env }, provide) => {
      await provide(createEmulatorAuth(env));
    },
    ownerApi: async ({ env, emulator }, provide) => {
      await provide(await apiFor(env, emulator, SEED_USERS.owner));
    },
    createUser: async ({ env, emulator, ownerApi }, provide) => {
      await provide(async (args = {}) => {
        // A new account per call, also when the same test re-runs against long-lived emulators.
        const id = randomUUID().replaceAll("-", "").slice(0, 12);
        const label = args.label ?? "User";
        const input = { email: `u-${id}@e2e.local`, password: `pw-${id}`, displayName: `${label} ${id.slice(0, 4)}` };
        const { uid } = await emulator.upsertUser(input);
        const api = await apiFor(env, emulator, input);
        await api.get("/v1/me");
        for (const organization of args.organizations ?? []) {
          await joinOrganization({
            owner: ownerApi,
            member: api,
            email: input.email,
            organizationId: organization.id,
            roles: organization.roles ?? MEMBER,
          });
          await api.put("/v1/me/active-organization", { organizationId: organization.id });
        }
        return { uid, ...input, api };
      });
    },
  });

export { expect } from "@playwright/test";
