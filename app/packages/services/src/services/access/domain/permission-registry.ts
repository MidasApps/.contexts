import {
  CORE_PERMISSIONS,
  OWNER_ONLY_PERMISSION,
  PermissionDefinitionSchema,
  type Permission,
  type PermissionDefinition,
  type PlatformRole,
  type SystemRoleKey,
} from "@core/contracts";

/** Permissions contributed by one module; ids must start with `<moduleId>.`. */
export type PermissionSource = { readonly moduleId: string; readonly permissions: readonly PermissionDefinition[] };

/** The core catalog; the core module may also declare `platform.*` permissions. */
export const CORE_PERMISSION_SOURCE: PermissionSource = { moduleId: "core", permissions: CORE_PERMISSIONS };

const CORE_MODULE_ID = "core";
const CORE_PREFIXES = ["core.", "platform."] as const;

export type PermissionRegistryErrorCode = "DUPLICATE_PERMISSION" | "PERMISSION_OUTSIDE_MODULE" | "INVALID_PERMISSION_DEFINITION";

/** Bug: a permission catalog that cannot be registered (raised at startup). */
export class PermissionRegistryError extends Error {
  readonly code: PermissionRegistryErrorCode;
  readonly permissionId: string;

  constructor(args: { code: PermissionRegistryErrorCode; permissionId: string; moduleId: string }) {
    super(`${args.code}: ${args.permissionId} (module ${args.moduleId})`);
    this.name = "PermissionRegistryError";
    this.code = args.code;
    this.permissionId = args.permissionId;
  }
}

export type PermissionRegistry = {
  readonly get: (id: string) => PermissionDefinition | undefined;
  /** Every registered permission, sorted by id. */
  readonly list: () => readonly PermissionDefinition[];
  /** Tenant-scoped permissions only, sorted by id (GET /v1/permissions). */
  readonly listTenantPermissions: () => readonly PermissionDefinition[];
  readonly permissionsForSystemRole: (key: SystemRoleKey) => ReadonlySet<Permission>;
  readonly permissionsForPlatformRole: (role: PlatformRole) => ReadonlySet<Permission>;
};

const isInsideModule = (moduleId: string, permissionId: string): boolean =>
  moduleId === CORE_MODULE_ID
    ? CORE_PREFIXES.some((prefix) => permissionId.startsWith(prefix))
    : permissionId.startsWith(`${moduleId}.`);

const validateDefinition = (source: PermissionSource, definition: PermissionDefinition): PermissionDefinition => {
  const context = { permissionId: definition.id, moduleId: source.moduleId };
  const parsed = PermissionDefinitionSchema.safeParse(definition);
  if (!parsed.success) throw new PermissionRegistryError({ code: "INVALID_PERMISSION_DEFINITION", ...context });
  if (!isInsideModule(source.moduleId, parsed.data.id)) throw new PermissionRegistryError({ code: "PERMISSION_OUTSIDE_MODULE", ...context });
  return parsed.data;
};

const indexSources = (sources: readonly PermissionSource[]): Map<string, PermissionDefinition> => {
  const byId = new Map<string, PermissionDefinition>();
  for (const source of sources) {
    for (const definition of source.permissions) {
      const valid = validateDefinition(source, definition);
      if (byId.has(valid.id)) {
        throw new PermissionRegistryError({ code: "DUPLICATE_PERMISSION", permissionId: valid.id, moduleId: source.moduleId });
      }
      byId.set(valid.id, valid);
    }
  }
  return byId;
};

const idsWhere = (definitions: readonly PermissionDefinition[], keep: (definition: PermissionDefinition) => boolean): ReadonlySet<Permission> =>
  new Set(definitions.filter(keep).map((definition) => definition.id));

// Owner holds every tenant permission and admin all but one by rule (SP1 spec §5.1);
// the other roles hold what each definition lists.
const buildSystemRoleSets = (tenant: readonly PermissionDefinition[]): ReadonlyMap<SystemRoleKey, ReadonlySet<Permission>> => {
  const listed = (key: SystemRoleKey) => idsWhere(tenant, (definition) => definition.defaultRoles.includes(key));
  return new Map<SystemRoleKey, ReadonlySet<Permission>>([
    ["owner", idsWhere(tenant, () => true)],
    ["admin", idsWhere(tenant, (definition) => definition.id !== OWNER_ONLY_PERMISSION)],
    ["member", listed("member")],
    ["viewer", listed("viewer")],
    ["device", listed("device")],
  ]);
};

const buildPlatformRoleSets = (platform: readonly PermissionDefinition[]): ReadonlyMap<PlatformRole, ReadonlySet<Permission>> =>
  new Map<PlatformRole, ReadonlySet<Permission>>([
    ["platform-admin", idsWhere(platform, () => true)],
    ["platform-support", idsWhere(platform, (definition) => definition.defaultRoles.includes("platform-support"))],
  ]);

const EMPTY: ReadonlySet<Permission> = new Set();

/**
 * Builds the permission catalog from the core and module sources (a composition step).
 * @throws {PermissionRegistryError} on a duplicate id, an id outside its module's
 *   prefix, or a definition that fails `PermissionDefinitionSchema`.
 */
export const createPermissionRegistry = (sources: readonly PermissionSource[]): PermissionRegistry => {
  const byId = indexSources(sources);
  const all = [...byId.values()].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const tenant = all.filter((definition) => definition.scope === "tenant");
  const systemRoles = buildSystemRoleSets(tenant);
  const platformRoles = buildPlatformRoleSets(all.filter((definition) => definition.scope === "platform"));
  return {
    get: (id) => byId.get(id),
    list: () => all,
    listTenantPermissions: () => tenant,
    permissionsForSystemRole: (key) => systemRoles.get(key) ?? EMPTY,
    permissionsForPlatformRole: (role) => platformRoles.get(role) ?? EMPTY,
  };
};
