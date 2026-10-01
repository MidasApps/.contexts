// Composition root of the module settings context (decision 0015 §6).
import type { Firestore } from "firebase-admin/firestore";
import type { AuditWriter } from "../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../shared/clock/clock.ts";
import { createFirestoreUnitOfWork, type UnitOfWork } from "../shared/firestore/unit-of-work.ts";
import { createFirestoreModuleSettingsRepository } from "./adapters/driven/firestore-module-settings-repository.ts";
import type { ModuleSettingsRepository } from "./application/ports/driven/module-settings-repository.ts";
import { makeGetModuleSettings, type GetModuleSettings } from "./application/use-cases/get-module-settings.ts";
import { makeUpdateModuleSettings, type UpdateModuleSettings } from "./application/use-cases/update-module-settings.ts";
import { createModuleSettingsRegistry, type ModuleSettingsDefinition, type ModuleSettingsRegistry } from "./domain/module-settings-registry.ts";

export type ModuleSettingsServices = {
  readonly registry: ModuleSettingsRegistry;
  readonly getModuleSettings: GetModuleSettings;
  readonly updateModuleSettings: UpdateModuleSettings;
};

/**
 * Binds the module settings use cases to their adapters (in-memory fakes in unit tests).
 * @throws {ModuleSettingsRegistryError} when two modules declare settings under one id.
 */
export const createModuleSettingsServices = (deps: {
  definitions: readonly ModuleSettingsDefinition[];
  repository: ModuleSettingsRepository;
  audit: AuditWriter;
  unitOfWork: UnitOfWork;
  clock: Clock;
}): ModuleSettingsServices => {
  const registry = createModuleSettingsRegistry(deps.definitions);
  const bound = { registry, repository: deps.repository, audit: deps.audit, unitOfWork: deps.unitOfWork, clock: deps.clock };
  return { registry, getModuleSettings: makeGetModuleSettings(bound), updateModuleSettings: makeUpdateModuleSettings(bound) };
};

/** The Firestore-backed services `createCoreServer` builds (adapters keep references only). */
export const createFirestoreModuleSettingsServices = (deps: {
  firestore: Firestore;
  definitions: readonly ModuleSettingsDefinition[];
  audit: AuditWriter;
  clock: Clock;
}): ModuleSettingsServices =>
  createModuleSettingsServices({
    definitions: deps.definitions,
    repository: createFirestoreModuleSettingsRepository({ firestore: deps.firestore }),
    audit: deps.audit,
    unitOfWork: createFirestoreUnitOfWork({ firestore: deps.firestore }),
    clock: deps.clock,
  });
