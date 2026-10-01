import type { ModuleSettingsRepository, StoredModuleSettings } from "../../application/ports/driven/module-settings-repository.ts";

export type InMemoryModuleSettingsRepository = ModuleSettingsRepository & {
  /** Every stored record, in insertion order (assertions). */
  readonly snapshot: () => readonly StoredModuleSettings[];
};

/** In-memory `ModuleSettingsRepository` for unit tests (the transaction handle is ignored). */
export const createInMemoryModuleSettingsRepository = (): InMemoryModuleSettingsRepository => {
  const records = new Map<string, StoredModuleSettings>();
  const keyOf = (tenantId: string, moduleId: string) => `${tenantId}_${moduleId}`;
  return {
    get: (_tx, key) => Promise.resolve(records.get(keyOf(key.tenantId, key.moduleId)) ?? null),
    put: (_tx, record) => void records.set(keyOf(record.tenantId, record.moduleId), record),
    snapshot: () => [...records.values()],
  };
};
