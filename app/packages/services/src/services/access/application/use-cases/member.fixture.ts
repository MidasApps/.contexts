// Test world of the members and invitations vertical: the access write world plus
// in-memory invitations, a settable clock, a fake directory and a fake key revoker.
import { type UserId, UserIdSchema } from "@core/contracts";
import type { Clock } from "#/services/shared/clock/clock.ts";
import { createLogger } from "#/services/shared/observability/logger.ts";
import { createInMemoryInvitationRepository } from "../../adapters/driven/in-memory-invitation-repository.ts";
import { createMemberServices } from "../../member-composition.ts";
import type { MemberDeps } from "../member-deps.ts";
import type { DirectoryAccount } from "../ports/driven/user-directory.ts";
import { makeAccessWriteWorld, NOW } from "./access-write.fixture.ts";

export const APP_URL = "https://app.example.com";

/** A settable clock starting at the fixture's `NOW`. */
const settableClock = (): Clock & { set: (iso: string) => void } => {
  let current = new Date(NOW);
  return { now: () => new Date(current.getTime()), set: (iso) => void (current = new Date(iso)) };
};

export const makeMemberWorld = () => {
  const world = makeAccessWriteWorld();
  const clock = settableClock();
  const invitations = createInMemoryInvitationRepository();
  const accounts = new Map<string, DirectoryAccount>();
  const revoked: { tenantId: string; ownerUid: string }[] = [];
  const notified: string[] = [];
  const userLocales = new Map<string, string>();
  const organizationLocales = new Map<string, string>();
  let fill = 0;
  const deps: MemberDeps = {
    ...world.deps,
    clock,
    invitations,
    notifier: {
      invitationCreated: ({ acceptUrl }) => {
        notified.push(acceptUrl);
        return Promise.resolve();
      },
    },
    directory: {
      getMany: (uids) =>
        Promise.resolve(
          new Map(
            uids.flatMap((uid) =>
              accounts.has(uid)
                ? [
                    [
                      uid,
                      { displayName: accounts.get(uid)?.displayName ?? "", email: accounts.get(uid)?.email ?? "" },
                    ] as const,
                  ]
                : [],
            ),
          ),
        ),
      getAccount: (uid) => Promise.resolve(accounts.get(uid) ?? null),
      getPreferredLocale: (uid) => Promise.resolve(userLocales.get(uid)),
    },
    organizations: {
      getName: (tenantId) =>
        Promise.resolve(tenantId === "org-a" || tenantId === "org-b" ? `Name of ${tenantId}` : null),
      getDefaultLocale: (tenantId) => Promise.resolve(organizationLocales.get(tenantId) ?? null),
    },
    apiKeys: {
      revokeOwnedKeys: ({ tenantId, ownerUid }) => {
        revoked.push({ tenantId, ownerUid });
        return Promise.resolve(1);
      },
    },
    // Each token differs: bytes filled with an increasing value.
    randomBytes: (size) => new Uint8Array(size).fill((fill += 1)),
    appUrl: APP_URL,
    logger: createLogger({ context: { service: "test", env: "local" }, sink: (record) => world.logs.push(record) }),
  };
  /** Registers an Auth account (verified by default). */
  const account = (uid: string, email: string, options: { verified?: boolean; displayName?: string } = {}) =>
    void accounts.set(uid, { email, displayName: options.displayName ?? uid, emailVerified: options.verified ?? true });
  /** The preferred locale of a user and the default locale of an organization (accept links). */
  const locale = (uid: string, tag: string) => void userLocales.set(uid, tag);
  const organizationLocale = (tenantId: string, tag: string) => void organizationLocales.set(tenantId, tag);
  const tokenOf = (acceptUrl: string): string => acceptUrl.split("#token=")[1] ?? "";
  const uid = (value: string): UserId => UserIdSchema.parse(value);
  return {
    ...world,
    clock,
    invitations,
    deps,
    members: createMemberServices(deps),
    account,
    locale,
    organizationLocale,
    revoked,
    notified,
    tokenOf,
    uid,
  };
};
