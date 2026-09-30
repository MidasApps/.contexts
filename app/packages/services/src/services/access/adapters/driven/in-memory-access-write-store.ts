import {
  MembershipIdSchema,
  RoleIdSchema,
  type AccessProjection,
  type Membership,
  type Role,
} from "@core/contracts";
import { paginateInMemory } from "../../../shared/pagination/page.ts";
import type { AccessProjectionStore } from "../../application/ports/driven/access-projection-writer.ts";
import type { ClaimsWriter, CoreClaims } from "../../application/ports/driven/claims-writer.ts";
import type { GrantReader } from "../../application/ports/driven/grant-reader.ts";
import type { MembershipRepository } from "../../application/ports/driven/membership-repository.ts";
import type { RoleReader } from "../../application/ports/driven/role-reader.ts";
import type { RoleRepository } from "../../application/ports/driven/role-repository.ts";
import type { NewUserProfile, UserAccessState, UserAccessVersionStore } from "../../application/ports/driven/user-access-version.ts";
import { nodeIdOf } from "../../domain/access-projection.ts";
import { holdsOwner } from "../../domain/role-permissions.ts";

type Stored<T> = { value: T; deletedAt: string | null };

type UserRow = UserAccessState & { profile?: NewUserProfile };

/**
 * In-memory fake of the access write side (SP1 Task 9 unit tests). Its `grants` and
 * `roles` readers see the same data, so `authorize()` decides on what the use cases wrote.
 * Transactions are ignored: use cases already read before they write.
 */
export type InMemoryAccessWriteStore = {
  readonly memberships: MembershipRepository;
  readonly roles: RoleRepository;
  readonly projections: AccessProjectionStore;
  readonly users: UserAccessVersionStore;
  readonly claims: ClaimsWriter & { readonly claimsOf: (uid: string) => CoreClaims | undefined; failNext: () => void };
  readonly grantReader: GrantReader;
  readonly roleReader: RoleReader;
  /** Test seeding and inspection. */
  readonly putUser: (uid: string, state?: Partial<UserAccessState>) => void;
  readonly userOf: (uid: string) => (UserAccessState & { profile?: NewUserProfile }) | undefined;
  readonly allMemberships: () => readonly (Membership & { deletedAt: string | null })[];
  readonly projectionOf: (tenantId: string, principalId: string) => AccessProjection | undefined;
};

type Tables = {
  memberships: Map<string, Stored<Membership>>;
  roles: Map<string, Stored<Role>>;
  projections: Map<string, AccessProjection>;
  users: Map<string, UserRow>;
  claims: Map<string, CoreClaims>;
  sequence: { next: number; failClaims: boolean };
};

const liveValues = <T>(table: Map<string, Stored<T>>): T[] => [...table.values()].filter((row) => row.deletedAt === null).map((row) => row.value);

const nextId = (tables: Tables, prefix: string): string => {
  tables.sequence.next += 1;
  return `${prefix}-${tables.sequence.next}`;
};

const makeMemberships = (tables: Tables): MembershipRepository => {
  const live = () => liveValues(tables.memberships);
  return {
    newId: () => MembershipIdSchema.parse(nextId(tables, "membership")),
    get: (_tx, id) => {
      const row = tables.memberships.get(id);
      return Promise.resolve(row === undefined || row.deletedAt !== null ? null : row.value);
    },
    listOfPrincipal: (_tx, { tenantId, principalId }) => Promise.resolve(live().filter((m) => m.tenantId === tenantId && m.principalId === principalId)),
    listOfPrincipals: ({ tenantId, principalIds }) => Promise.resolve(live().filter((m) => m.tenantId === tenantId && principalIds.includes(m.principalId))),
    list: ({ tenantId, principalId, page }) =>
      Promise.resolve(
        paginateInMemory({
          items: live().filter((m) => m.tenantId === tenantId && (principalId === undefined || m.principalId === principalId)),
          page,
          positionOf: (m) => [m.createdAt, m.id],
        }),
      ),
    listOrganizationOwners: (_tx, tenantId) =>
      Promise.resolve(live().filter((m) => m.tenantId === tenantId && m.node.level === "organization" && m.principalType === "user" && holdsOwner(m.roles))),
    isRoleInUse: (_tx, { tenantId, roleId }) =>
      Promise.resolve(live().some((m) => m.tenantId === tenantId && m.roles.some((role) => role.kind === "custom" && role.roleId === roleId))),
    create: (_tx, { membership }) => void tables.memberships.set(membership.id, { value: membership, deletedAt: null }),
    updateRoles: (_tx, { id, roles, updatedAt }) => {
      const row = tables.memberships.get(id);
      if (row !== undefined) row.value = { ...row.value, roles: [...roles], updatedAt };
    },
    softDelete: (_tx, { id, deletedAt }) => {
      const row = tables.memberships.get(id);
      if (row !== undefined) row.deletedAt = deletedAt;
    },
  };
};

const makeRoles = (tables: Tables): RoleRepository => ({
  newId: () => RoleIdSchema.parse(nextId(tables, "role")),
  get: (_tx, id) => {
    const row = tables.roles.get(id);
    return Promise.resolve(row === undefined || row.deletedAt !== null ? null : row.value);
  },
  list: ({ tenantId, page }) =>
    Promise.resolve(paginateInMemory({ items: liveValues(tables.roles).filter((r) => r.tenantId === tenantId), page, positionOf: (r) => [r.name, r.id] })),
  create: (_tx, { role }) => void tables.roles.set(role.id, { value: role, deletedAt: null }),
  update: (_tx, { role }) => {
    const row = tables.roles.get(role.id);
    if (row !== undefined) row.value = role;
  },
  softDelete: (_tx, { id, deletedAt }) => {
    const row = tables.roles.get(id);
    if (row !== undefined) row.deletedAt = deletedAt;
  },
});

const projectionKey = (tenantId: string, principalId: string): string => `${tenantId}_${principalId}`;

const makeProjections = (tables: Tables): AccessProjectionStore => ({
  get: (_tx, { tenantId, principalId }) => Promise.resolve(tables.projections.get(projectionKey(tenantId, principalId)) ?? null),
  write: (_tx, { projection }) => void tables.projections.set(projection.id, projection),
  listMembers: ({ tenantId, page }) =>
    Promise.resolve(
      paginateInMemory({
        items: [...tables.projections.values()].filter((p) => p.tenantId === tenantId && p.principalType === "user" && !p.isRevoked),
        page,
        positionOf: (p) => [p.principalId, p.id],
      }),
    ),
  listUnrevoked: (_tx, { tenantId, limit }) =>
    Promise.resolve([...tables.projections.values()].filter((p) => p.tenantId === tenantId && !p.isRevoked).slice(0, limit)),
  markRevoked: (_tx, { projections, updatedAt }) => {
    for (const p of projections) tables.projections.set(p.id, { ...p, isRevoked: true, version: p.version + 1, updatedAt });
    return Promise.resolve();
  },
});

const makeUsers = (tables: Tables): UserAccessVersionStore => ({
  read: (_tx, uid) => {
    const row = tables.users.get(uid);
    return Promise.resolve(row === undefined ? null : { accessVersion: row.accessVersion, activeOrganizationId: row.activeOrganizationId });
  },
  bump: (_tx, { uid, current, activeOrganizationId }) =>
    void tables.users.set(uid, {
      ...tables.users.get(uid),
      accessVersion: current.accessVersion + 1,
      activeOrganizationId: activeOrganizationId ?? current.activeOrganizationId,
    }),
  create: (_tx, { uid, profile, accessVersion, activeOrganizationId }) => void tables.users.set(uid, { accessVersion, activeOrganizationId, profile }),
});

const makeClaims = (tables: Tables): InMemoryAccessWriteStore["claims"] => ({
  writeClaims: (uid, claims) => {
    if (tables.sequence.failClaims) {
      tables.sequence.failClaims = false;
      return Promise.reject(new Error("claims backend unavailable"));
    }
    tables.claims.set(uid, claims);
    return Promise.resolve();
  },
  claimsOf: (uid) => tables.claims.get(uid),
  failNext: () => void (tables.sequence.failClaims = true),
});

const makeReaders = (tables: Tables): Pick<InMemoryAccessWriteStore, "grantReader" | "roleReader"> => ({
  grantReader: {
    listGrants: ({ tenantId, principalId, nodeIds }) =>
      Promise.resolve(
        [...tables.memberships.values()]
          .filter(({ value }) => value.tenantId === tenantId && value.principalId === principalId && nodeIds.includes(nodeIdOf(value.node)))
          .map(({ value, deletedAt }) => ({
            membershipId: value.id,
            tenantId: value.tenantId,
            principalId: value.principalId,
            nodeId: nodeIdOf(value.node),
            roles: value.roles,
            isDeleted: deletedAt !== null,
          })),
      ),
  },
  roleReader: {
    getRoles: ({ roleIds }) =>
      Promise.resolve(
        roleIds.flatMap((id) => {
          const row = tables.roles.get(id);
          return row === undefined ? [] : [{ id: row.value.id, tenantId: row.value.tenantId, permissions: row.value.permissions, isDeleted: row.deletedAt !== null }];
        }),
      ),
  },
});

/** Creates an empty in-memory access write store. */
export const createInMemoryAccessWriteStore = (): InMemoryAccessWriteStore => {
  const tables: Tables = { memberships: new Map(), roles: new Map(), projections: new Map(), users: new Map(), claims: new Map(), sequence: { next: 0, failClaims: false } };
  return {
    memberships: makeMemberships(tables),
    roles: makeRoles(tables),
    projections: makeProjections(tables),
    users: makeUsers(tables),
    claims: makeClaims(tables),
    ...makeReaders(tables),
    putUser: (uid, state = {}) =>
      void tables.users.set(uid, { accessVersion: state.accessVersion ?? 0, activeOrganizationId: state.activeOrganizationId ?? null }),
    userOf: (uid) => tables.users.get(uid),
    allMemberships: () => [...tables.memberships.values()].map(({ value, deletedAt }) => ({ ...value, deletedAt })),
    projectionOf: (tenantId, principalId) => tables.projections.get(projectionKey(tenantId, principalId)),
  };
};
