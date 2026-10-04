import type { ModuleManifest } from "@core/contracts";
import type { ExtraNamespaces, MessageTree } from "@core/i18n";
import type {
  ClientModule,
  ModuleRegistry,
  NavTarget,
  ResolvedModulePage,
  ShellNavItem,
} from "#/shared/lib/shell/shell-types.ts";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";

export type { ModuleRegistry, ResolvedModulePage } from "#/shared/lib/shell/shell-types.ts";

/** Two modules share an id: a composition bug, raised when the app shell is created. */
export class ModuleRegistryError extends Error {
  readonly code = "DUPLICATE_MODULE";
  readonly moduleId: string;

  constructor(moduleId: string) {
    super(`DUPLICATE_MODULE: ${moduleId}`);
    this.name = "ModuleRegistryError";
    this.moduleId = moduleId;
  }
}

const SETTINGS_ORDER = 1000;
// Core items of a slot use 0 and 1000; modules without an order sit in between.
const DEFAULT_MODULE_ORDER = 500;

const matchKey = (key: string, segments: readonly string[]): Record<string, string> | null => {
  const parts = key === "" ? [] : key.split("/");
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of parts.entries()) {
    const segment = segments[index] ?? "";
    if (part.startsWith(":")) params[part.slice(1)] = segment;
    else if (part !== segment) return null;
  }
  return params;
};

const resolveIn = (module: ClientModule, rest: string): ResolvedModulePage | null => {
  const segments = rest === "" ? [] : rest.split("/");
  // Static keys win over param keys (`items/new` before `items/:itemId`).
  const entries = Object.entries(module.lazyPages).toSorted(([a], [b]) => a.split(":").length - b.split(":").length);
  for (const [key, Page] of entries) {
    const params = matchKey(key, segments);
    if (params !== null) return { key, Page, params };
  }
  return null;
};

const navTargetOf = (moduleId: string, item: NonNullable<ModuleManifest["navigation"]>[number]): NavTarget =>
  item.slot === "settings"
    ? { kind: "settings-module", moduleId }
    : item.slot === "admin"
      ? { kind: "admin", rest: item.path === "" ? moduleId : `${moduleId}/${item.path}` }
      : { kind: "module", moduleId, path: item.path };

// Icons were checked by defineClientModule, so the cast only narrows a validated string.
const navItemsOf = ({ manifest }: ClientModule): ShellNavItem[] => [
  ...(manifest.navigation ?? []).map((item) => ({
    id: `${manifest.id}.${item.id}`,
    slot: item.slot,
    labelKey: item.labelKey,
    icon: item.icon as IconName,
    permission: item.permission,
    order: item.order ?? DEFAULT_MODULE_ORDER,
    target: navTargetOf(manifest.id, item),
  })),
  ...(manifest.settings === undefined
    ? []
    : [
        {
          id: `${manifest.id}.settings`,
          slot: "settings" as const,
          labelKey: manifest.labelKey,
          icon: "puzzle" as const,
          permission: manifest.settings.readPermission,
          order: SETTINGS_ORDER,
          target: { kind: "settings-module" as const, moduleId: manifest.id },
        },
      ]),
];

/**
 * The installed client modules (decision 0015 §3), built once by the app shell.
 * @throws {ModuleRegistryError} for a duplicate module id.
 */
export const createModuleRegistry = (modules: readonly ClientModule[]): ModuleRegistry => {
  const byId = new Map<string, ClientModule>();
  for (const module of modules) {
    if (byId.has(module.manifest.id)) throw new ModuleRegistryError(module.manifest.id);
    byId.set(module.manifest.id, module);
  }
  const messages: ExtraNamespaces = Object.fromEntries(
    modules.map((module) => [module.manifest.id, module.manifest.messages as Partial<Record<string, MessageTree>>]),
  );
  return {
    list: () => modules,
    get: (moduleId) => byId.get(moduleId),
    messages: () => messages,
    resolvePage: (moduleId, rest) => {
      const module = byId.get(moduleId);
      return module === undefined ? null : resolveIn(module, rest);
    },
    contracts: () => modules.flatMap((module) => module.contracts ?? []),
    navItems: () => modules.flatMap(navItemsOf),
  };
};
