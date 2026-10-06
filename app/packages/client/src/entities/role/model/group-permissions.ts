import type { PermissionDefinition } from "@core/contracts";

/** Permissions of one resource (`core.member.*`), in registry order. */
export type PermissionResourceGroup = {
  readonly resource: string;
  readonly permissions: readonly PermissionDefinition[];
};

/** Permissions of one module (`core` or a module id), grouped by resource. */
export type PermissionModuleGroup = {
  readonly moduleId: string;
  readonly resources: readonly PermissionResourceGroup[];
};

const partsOf = (id: string): { moduleId: string; resource: string } => {
  const [moduleId = id, resource = id] = id.split(".");
  return { moduleId, resource };
};

const coreFirst = (a: string, b: string): number =>
  a === "core" ? -1 : b === "core" ? 1 : a.localeCompare(b, "en-US");

/**
 * Groups tenant permissions by module (the id prefix: `core` first, then modules by id) and by
 * resource inside it, for the role editor and the API key scope picker (SP2 spec §8). Platform
 * permissions are never grantable in a tenant, so they are left out.
 */
export const groupPermissionsByModule = (permissions: readonly PermissionDefinition[]): PermissionModuleGroup[] => {
  const modules = new Map<string, Map<string, PermissionDefinition[]>>();
  for (const permission of permissions) {
    if (permission.scope !== "tenant") continue;
    const { moduleId, resource } = partsOf(permission.id);
    const resources = modules.get(moduleId) ?? new Map<string, PermissionDefinition[]>();
    resources.set(resource, [...(resources.get(resource) ?? []), permission]);
    modules.set(moduleId, resources);
  }
  return [...modules.keys()].toSorted(coreFirst).map((moduleId) => ({
    moduleId,
    resources: [...(modules.get(moduleId) ?? new Map<string, PermissionDefinition[]>()).entries()].map(
      ([resource, list]) => ({ resource, permissions: list }),
    ),
  }));
};
