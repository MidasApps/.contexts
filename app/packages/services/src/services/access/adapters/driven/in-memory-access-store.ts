import {
  ImpersonationSessionIdSchema,
  MembershipIdSchema,
  OrganizationIdSchema,
  type OrganizationStatus,
  ProjectIdSchema,
  RoleIdSchema,
  type RoleRef,
  type TenantNodeRef,
  type UserStatus,
} from "@core/contracts";
import type { AccessReaders } from "../../application/ports/driven/access-readers.ts";
import type {
  ApiKeyStatusRecord,
  DeviceStatusRecord,
  ImpersonationSessionRecord,
  PlatformStaffRecord,
} from "../../application/ports/driven/principal-status-reader.ts";
import type { CustomRoleRecord, GrantRecord } from "../../domain/grant.ts";
import type { ChainNode, ChainUnit, NodeChain } from "../../domain/node-chain.ts";

type StoredUnit = ChainUnit & { readonly ancestorIds: readonly string[] };

/** Reader method names, for call counting (request-scope memoization tests). */
export type AccessReaderCall =
  | "listGrants"
  | "getRoles"
  | "loadChain"
  | "getUser"
  | "getDevice"
  | "getApiKey"
  | "getPlatformStaff"
  | "getImpersonationSession";

/** In-memory fake of the four access ports (SP1 Task 6), seeded by tests. */
export type InMemoryAccessStore = AccessReaders & {
  readonly putOrganization: (args: { id: string; status?: OrganizationStatus; isDeleted?: boolean }) => void;
  readonly putProject: (args: { id: string; tenantId: string; isDeleted?: boolean }) => void;
  readonly putUnit: (args: {
    id: string;
    tenantId: string;
    projectId: string;
    ancestorIds?: readonly string[];
    isDeleted?: boolean;
  }) => void;
  readonly putGrant: (args: {
    tenantId: string;
    principalId: string;
    nodeId: string;
    roles: readonly RoleRef[];
    isDeleted?: boolean;
    membershipId?: string;
  }) => void;
  readonly putRole: (args: {
    id: string;
    tenantId: string;
    permissions: readonly string[];
    isDeleted?: boolean;
  }) => void;
  readonly putUser: (uid: string, status?: UserStatus) => void;
  readonly putDevice: (deviceId: string, record: DeviceStatusRecord) => void;
  readonly putApiKey: (apiKeyId: string, record: ApiKeyStatusRecord) => void;
  readonly putPlatformStaff: (uid: string, record: PlatformStaffRecord) => void;
  readonly putImpersonationSession: (sessionId: string, record: ImpersonationSessionRecord) => void;
  /** How many times a reader method was called. */
  readonly callCount: (call: AccessReaderCall) => number;
};

type Tables = {
  organizations: Map<string, ChainNode & { status: OrganizationStatus }>;
  projects: Map<string, ChainNode>;
  units: Map<string, StoredUnit>;
  grants: GrantRecord[];
  roles: Map<string, CustomRoleRecord>;
  users: Map<string, UserStatus>;
  devices: Map<string, DeviceStatusRecord>;
  apiKeys: Map<string, ApiKeyStatusRecord>;
  staff: Map<string, PlatformStaffRecord>;
  impersonations: Map<string, ImpersonationSessionRecord>;
};

const createTables = (): Tables => ({
  organizations: new Map(),
  projects: new Map(),
  units: new Map(),
  grants: [],
  roles: new Map(),
  users: new Map(),
  devices: new Map(),
  apiKeys: new Map(),
  staff: new Map(),
  impersonations: new Map(),
});

const loadUnitChain = (tables: Tables, unitId: string): { project: ChainNode; units: ChainUnit[] } | null => {
  const unit = tables.units.get(unitId);
  if (unit === undefined) return null;
  const ancestors = unit.ancestorIds.map((id) => tables.units.get(id));
  const project = tables.projects.get(unit.projectId);
  if (project === undefined || ancestors.some((ancestor) => ancestor === undefined)) return null;
  return { project, units: [...ancestors.filter((ancestor): ancestor is StoredUnit => ancestor !== undefined), unit] };
};

// Loads by the ids in the node ref; `authorize()` checks that tenants and projects agree.
const loadChain = (tables: Tables, node: TenantNodeRef): NodeChain | null => {
  const organization = tables.organizations.get(node.tenantId);
  if (organization === undefined) return null;
  if (node.level === "organization") return { organization, units: [] };
  if (node.level === "project") {
    const project = tables.projects.get(node.projectId);
    return project === undefined ? null : { organization, project, units: [] };
  }
  const unitChain = loadUnitChain(tables, node.unitId);
  return unitChain === null ? null : { organization, ...unitChain };
};

const makeReaders = (tables: Tables, count: (call: AccessReaderCall) => void): AccessReaders => {
  const lookup = <Value>(
    call: AccessReaderCall,
    table: ReadonlyMap<string, Value>,
    key: string,
  ): Promise<Value | null> => {
    count(call);
    return Promise.resolve(table.get(key) ?? null);
  };
  return buildReaders(tables, count, lookup);
};

type Lookup = <Value>(call: AccessReaderCall, table: ReadonlyMap<string, Value>, key: string) => Promise<Value | null>;

const buildReaders = (tables: Tables, count: (call: AccessReaderCall) => void, lookup: Lookup): AccessReaders => ({
  grants: {
    listGrants: ({ tenantId, principalId, nodeIds }) => {
      count("listGrants");
      const onNodes = new Set(nodeIds);
      return Promise.resolve(
        tables.grants.filter((g) => g.tenantId === tenantId && g.principalId === principalId && onNodes.has(g.nodeId)),
      );
    },
  },
  roles: {
    getRoles: ({ roleIds }) => {
      count("getRoles");
      return Promise.resolve(roleIds.flatMap((id) => tables.roles.get(id) ?? []));
    },
  },
  nodeChains: {
    loadChain: (node) => {
      count("loadChain");
      return Promise.resolve(loadChain(tables, node));
    },
  },
  principals: {
    getUser: (uid) => {
      count("getUser");
      const status = tables.users.get(uid);
      return Promise.resolve(status === undefined ? null : { status });
    },
    getDevice: (deviceId) => lookup("getDevice", tables.devices, deviceId),
    getApiKey: (apiKeyId) => lookup("getApiKey", tables.apiKeys, apiKeyId),
    getPlatformStaff: (uid) => lookup("getPlatformStaff", tables.staff, uid),
    getImpersonationSession: (sessionId) => lookup("getImpersonationSession", tables.impersonations, sessionId),
  },
});

const makeWriters = (tables: Tables) => ({
  putOrganization: ({
    id,
    status = "active",
    isDeleted = false,
  }: {
    id: string;
    status?: OrganizationStatus;
    isDeleted?: boolean;
  }) => {
    tables.organizations.set(id, { id, tenantId: OrganizationIdSchema.parse(id), status, isDeleted });
  },
  putProject: ({ id, tenantId, isDeleted = false }: { id: string; tenantId: string; isDeleted?: boolean }) => {
    tables.projects.set(id, { id, tenantId: OrganizationIdSchema.parse(tenantId), isDeleted });
  },
  putUnit: (args: {
    id: string;
    tenantId: string;
    projectId: string;
    ancestorIds?: readonly string[];
    isDeleted?: boolean;
  }) => {
    const { id, tenantId, projectId, ancestorIds = [], isDeleted = false } = args;
    tables.units.set(id, {
      id,
      tenantId: OrganizationIdSchema.parse(tenantId),
      projectId: ProjectIdSchema.parse(projectId),
      ancestorIds,
      isDeleted,
    });
  },
  putGrant: (args: {
    tenantId: string;
    principalId: string;
    nodeId: string;
    roles: readonly RoleRef[];
    isDeleted?: boolean;
    membershipId?: string;
  }) => {
    const membershipId = MembershipIdSchema.parse(args.membershipId ?? `membership-${tables.grants.length + 1}`);
    const { tenantId, principalId, nodeId, roles, isDeleted = false } = args;
    tables.grants.push({
      membershipId,
      tenantId: OrganizationIdSchema.parse(tenantId),
      principalId,
      nodeId,
      roles,
      isDeleted,
    });
  },
  putRole: ({
    id,
    tenantId,
    permissions,
    isDeleted = false,
  }: {
    id: string;
    tenantId: string;
    permissions: readonly string[];
    isDeleted?: boolean;
  }) => {
    tables.roles.set(id, {
      id: RoleIdSchema.parse(id),
      tenantId: OrganizationIdSchema.parse(tenantId),
      permissions,
      isDeleted,
    });
  },
  putUser: (uid: string, status: UserStatus = "active") => void tables.users.set(uid, status),
  putDevice: (deviceId: string, record: DeviceStatusRecord) => void tables.devices.set(deviceId, record),
  putApiKey: (apiKeyId: string, record: ApiKeyStatusRecord) => void tables.apiKeys.set(apiKeyId, record),
  putPlatformStaff: (uid: string, record: PlatformStaffRecord) => void tables.staff.set(uid, record),
  putImpersonationSession: (sessionId: string, record: ImpersonationSessionRecord) =>
    void tables.impersonations.set(ImpersonationSessionIdSchema.parse(sessionId), record),
});

/**
 * Creates an empty in-memory access store. Readers return what was put, soft-deleted
 * records included, like the Firestore adapters of Task 9.
 * @example
 *   const store = createInMemoryAccessStore();
 *   store.putOrganization({ id: "org-1" });
 *   store.putGrant({ tenantId: "org-1", principalId: "uid-1", nodeId: "org-1", roles: [{ kind: "system", key: "owner" }] });
 */
export const createInMemoryAccessStore = (): InMemoryAccessStore => {
  const tables = createTables();
  const calls = new Map<AccessReaderCall, number>();
  const count = (call: AccessReaderCall) => void calls.set(call, (calls.get(call) ?? 0) + 1);
  return { ...makeReaders(tables, count), ...makeWriters(tables), callCount: (call) => calls.get(call) ?? 0 };
};
