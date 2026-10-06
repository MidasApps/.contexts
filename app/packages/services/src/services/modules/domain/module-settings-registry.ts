import type { ContractDefinition, ModuleSettingsManifest, Permission } from "@core/contracts";

/** The settings a module declares (`defineModule().settings`), keyed by its id. */
export type ModuleSettingsDefinition = {
  readonly moduleId: string;
  readonly contract: ContractDefinition;
  readonly readPermission: Permission;
  readonly updatePermission: Permission;
};

export type ModuleSettingsRegistry = { readonly get: (moduleId: string) => ModuleSettingsDefinition | undefined };

/** Two modules declared settings under one id: a composition bug, raised at startup. */
export class ModuleSettingsRegistryError extends Error {
  readonly code = "DUPLICATE_MODULE_SETTINGS";
  readonly moduleId: string;

  constructor(moduleId: string) {
    super(`DUPLICATE_MODULE_SETTINGS: ${moduleId}`);
    this.name = "ModuleSettingsRegistryError";
    this.moduleId = moduleId;
  }
}

/**
 * Registry of the installed modules' settings (decision 0015 §6).
 * @throws {ModuleSettingsRegistryError} for a duplicate module id.
 */
export const createModuleSettingsRegistry = (
  definitions: readonly ModuleSettingsDefinition[],
): ModuleSettingsRegistry => {
  const byId = new Map<string, ModuleSettingsDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.moduleId)) throw new ModuleSettingsRegistryError(definition.moduleId);
    byId.set(definition.moduleId, definition);
  }
  return { get: (moduleId) => byId.get(moduleId) };
};

/** The settings definitions of the modules that declare settings (manifests, in order). */
export const moduleSettingsDefinitionsOf = (
  modules: readonly { readonly id: string; readonly settings?: ModuleSettingsManifest | undefined }[],
): ModuleSettingsDefinition[] =>
  modules.flatMap((module) => (module.settings === undefined ? [] : [{ moduleId: module.id, ...module.settings }]));
