import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { AUDIT_LOG_COLLECTIONS } from "../../audit/adapters/driven/firestore-audit-log-writer.ts";
import { CONNECTORS_COLLECTION } from "../../connectors/adapters/driven/firestore-connector-repository.ts";
import { LOCAL_SECRETS_COLLECTION } from "../../connectors/adapters/driven/local-secret-store.ts";
import { FILES_COLLECTION } from "../../files/adapters/driven/firestore-file-repository.ts";
import { CORE_COLLECTIONS } from "../firestore/collections.ts";
import { IDEMPOTENCY_RECORDS_COLLECTION } from "../idempotency/firestore-idempotency-store.ts";
import { RATE_LIMIT_BUCKETS_COLLECTION } from "../rate-limit/firestore-rate-limiter.ts";

/**
 * Data of the Security Rules tests (SP1 spec §5.5): two organizations, projects and a
 * two-level unit tree in the first, and one access projection per kind of grant. The
 * docs carry only the fields the rules read; the services' contracts are not involved.
 */
export const ORG_1 = "org-1";
export const ORG_2 = "org-2";
export const DELETED_ORG = "org-deleted";

/** Every collection a client may read, directly and with the rules of §5.5. */
export const READABLE_COLLECTIONS = [
  CORE_COLLECTIONS.users,
  CORE_COLLECTIONS.access,
  CORE_COLLECTIONS.organizations,
  CORE_COLLECTIONS.projects,
  CORE_COLLECTIONS.units,
] as const;

/** Every collection that stays server-only (read and written through `/v1` and the Admin SDK). */
export const UNREADABLE_COLLECTIONS = [
  CORE_COLLECTIONS.platformStaff,
  CORE_COLLECTIONS.unitTreeLocks,
  CORE_COLLECTIONS.roles,
  CORE_COLLECTIONS.memberships,
  CORE_COLLECTIONS.invitations,
  CORE_COLLECTIONS.devices,
  CORE_COLLECTIONS.deviceActivations,
  CORE_COLLECTIONS.apiKeys,
  CORE_COLLECTIONS.impersonationSessions,
  CORE_COLLECTIONS.approvalRequests,
  CORE_COLLECTIONS.sessions,
  AUDIT_LOG_COLLECTIONS.tenant,
  AUDIT_LOG_COLLECTIONS.platform,
  RATE_LIMIT_BUCKETS_COLLECTION,
  IDEMPOTENCY_RECORDS_COLLECTION,
  FILES_COLLECTION,
  CONNECTORS_COLLECTION,
  LOCAL_SECRETS_COLLECTION,
  // Server-only collection of the module settings (decision 0015); denied by the catch-all.
  "module-settings",
] as const;

/** Uids of the test principals; `ids()` builds each access doc id from them. */
export const UID = {
  owner: "uid-owner",
  projectMember: "uid-project-member",
  unitMember: "uid-unit-member",
  siblingMember: "uid-sibling-member",
  revoked: "uid-revoked",
  outsider: "uid-outsider",
  device: "device-1",
  staff: "uid-staff",
} as const;

export const PROJECT = { first: "project-1", second: "project-2", deleted: "project-deleted", otherTenant: "project-x" } as const;
export const UNIT = { a: "unit-a", a1: "unit-a1", b: "unit-b", deleted: "unit-deleted" } as const;

const accessId = (tenantId: string, principalId: string) => `${tenantId}_${principalId}`;

type Access = { orgWide?: boolean; projectIds?: string[]; unitIds?: string[]; visibleProjectIds?: string[]; isRevoked?: boolean };

const accessDoc = (tenantId: string, principalId: string, access: Access) => ({
  tenantId,
  principalId,
  principalType: principalId === UID.device ? "device" : "user",
  orgWide: access.orgWide ?? false,
  projectIds: access.projectIds ?? [],
  unitIds: access.unitIds ?? [],
  visibleProjectIds: access.visibleProjectIds ?? [],
  isRevoked: access.isRevoked ?? false,
  version: 1,
});

const ACCESS_DOCS = [
  accessDoc(ORG_1, UID.owner, { orgWide: true, visibleProjectIds: [PROJECT.first, PROJECT.second] }),
  accessDoc(ORG_2, UID.owner, { orgWide: true, visibleProjectIds: [PROJECT.otherTenant] }),
  accessDoc(DELETED_ORG, UID.owner, { orgWide: true }),
  accessDoc(ORG_1, UID.projectMember, { projectIds: [PROJECT.first], visibleProjectIds: [PROJECT.first] }),
  accessDoc(ORG_1, UID.unitMember, { unitIds: [UNIT.a], visibleProjectIds: [PROJECT.first] }),
  accessDoc(ORG_1, UID.siblingMember, { unitIds: [UNIT.b], visibleProjectIds: [PROJECT.first] }),
  accessDoc(ORG_1, UID.revoked, { orgWide: true, isRevoked: true }),
  accessDoc(ORG_1, UID.device, { projectIds: [PROJECT.first], visibleProjectIds: [PROJECT.first] }),
];

const DELETED_AT = new Date("2026-09-01T00:00:00Z");

const organization = (id: string, deleted = false) => ({ tenantId: id, name: id, status: "active", deletedAt: deleted ? DELETED_AT : null });
const project = (tenantId: string, deleted = false) => ({ tenantId, name: "Project", status: "active", deletedAt: deleted ? DELETED_AT : null });
const unit = (args: { projectId: string; ancestorIds: string[]; deleted?: boolean }) => ({
  tenantId: ORG_1,
  projectId: args.projectId,
  parentUnitId: args.ancestorIds.at(-1) ?? null,
  ancestorIds: args.ancestorIds,
  depth: args.ancestorIds.length,
  type: "test.unit",
  name: "Unit",
  deletedAt: args.deleted === true ? DELETED_AT : null,
});

/** Documents keyed by path; server-only collections get one doc each, owned by the owner in `ORG_1`. */
export const seededDocuments = (): Record<string, Record<string, unknown>> => ({
  [`users/${UID.owner}`]: { email: "owner@example.test", displayName: "Owner", status: "active", accessVersion: 1 },
  [`users/${UID.projectMember}`]: { email: "member@example.test", displayName: "Member", status: "active", accessVersion: 1 },
  ...Object.fromEntries(ACCESS_DOCS.map((doc) => [`access/${accessId(doc.tenantId, doc.principalId)}`, doc])),
  [`organizations/${ORG_1}`]: organization(ORG_1),
  [`organizations/${ORG_2}`]: organization(ORG_2),
  [`organizations/${DELETED_ORG}`]: organization(DELETED_ORG, true),
  [`projects/${PROJECT.first}`]: project(ORG_1),
  [`projects/${PROJECT.second}`]: project(ORG_1),
  [`projects/${PROJECT.deleted}`]: project(ORG_1, true),
  [`projects/${PROJECT.otherTenant}`]: project(ORG_2),
  [`units/${UNIT.a}`]: unit({ projectId: PROJECT.first, ancestorIds: [] }),
  [`units/${UNIT.a1}`]: unit({ projectId: PROJECT.first, ancestorIds: [UNIT.a] }),
  [`units/${UNIT.b}`]: unit({ projectId: PROJECT.first, ancestorIds: [] }),
  [`units/${UNIT.deleted}`]: unit({ projectId: PROJECT.first, ancestorIds: [UNIT.a], deleted: true }),
  ...Object.fromEntries(
    UNREADABLE_COLLECTIONS.map((collection) => [
      `${collection}/${serverOnlyDocId(collection)}`,
      { tenantId: ORG_1, uid: UID.owner, principalId: UID.owner, ownerUid: UID.owner, staffUid: UID.staff },
    ]),
  ),
});

/** Server-only docs keyed like the ones a client could guess (`platform-staff/{uid}`, `access`-style ids). */
export const serverOnlyDocId = (collection: string): string =>
  collection === CORE_COLLECTIONS.platformStaff ? UID.staff : `${ORG_1}_${UID.owner}`;

/**
 * Writes the fixture with rules disabled. It never clears the emulator: other packages' emulator
 * tests share it during `pnpm test:emulators` (turbo runs them in parallel), and every client
 * write under test is denied, so the fixture stays unchanged and can be seeded once.
 */
export const seedRulesFixture = async (testEnv: RulesTestEnvironment): Promise<void> => {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await Promise.all(Object.entries(seededDocuments()).map(([path, data]) => db.doc(path).set(data)));
  });
};

/** Claims of each principal's ID token (the projection written by `ClaimsProjector`, SP1 spec §5.4). */
export const TOKENS = {
  owner: { uid: UID.owner, claims: { tenantId: ORG_1, accessVersion: 1 } },
  ownerInOrg2: { uid: UID.owner, claims: { tenantId: ORG_2, accessVersion: 1 } },
  ownerInDeletedOrg: { uid: UID.owner, claims: { tenantId: DELETED_ORG, accessVersion: 1 } },
  ownerWithoutTenant: { uid: UID.owner, claims: {} },
  projectMember: { uid: UID.projectMember, claims: { tenantId: ORG_1 } },
  unitMember: { uid: UID.unitMember, claims: { tenantId: ORG_1 } },
  siblingMember: { uid: UID.siblingMember, claims: { tenantId: ORG_1 } },
  revoked: { uid: UID.revoked, claims: { tenantId: ORG_1 } },
  outsider: { uid: UID.outsider, claims: { tenantId: ORG_1 } },
  device: { uid: UID.device, claims: { principalType: "device", tenantId: ORG_1 } },
  staff: { uid: UID.staff, claims: { platformRole: "platform-admin" } },
  impersonated: { uid: UID.owner, claims: { tenantId: ORG_1, imp: "session-1", impBy: UID.staff } },
} as const;

export type TokenName = keyof typeof TOKENS;
