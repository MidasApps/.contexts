// Public API of the module settings context (decision 0015 §6).
export {
  createFirestoreModuleSettingsRepository,
  MODULE_SETTINGS_COLLECTION,
  moduleSettingsDocId,
} from "./adapters/driven/firestore-module-settings-repository.ts";
export {
  createInMemoryModuleSettingsRepository,
  type InMemoryModuleSettingsRepository,
} from "./adapters/driven/in-memory-module-settings-repository.ts";
export { buildModuleSettingsRoutes } from "./adapters/driving/module-settings-routes.ts";
export type {
  ModuleSettingsKey,
  ModuleSettingsRepository,
  StoredModuleSettings,
} from "./application/ports/driven/module-settings-repository.ts";
export type { GetModuleSettings } from "./application/use-cases/get-module-settings.ts";
export type {
  UpdateModuleSettings,
  UpdateModuleSettingsCommand,
} from "./application/use-cases/update-module-settings.ts";
export {
  createFirestoreModuleSettingsServices,
  createModuleSettingsServices,
  type ModuleSettingsServices,
} from "./composition.ts";
export { InvalidModuleSettingsError, UnknownModuleError } from "./domain/module-settings-errors.ts";
export {
  createModuleSettingsRegistry,
  type ModuleSettingsDefinition,
  type ModuleSettingsRegistry,
  ModuleSettingsRegistryError,
  moduleSettingsDefinitionsOf,
} from "./domain/module-settings-registry.ts";
