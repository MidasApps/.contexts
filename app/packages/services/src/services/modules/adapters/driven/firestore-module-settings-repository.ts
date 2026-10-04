import { IsoDateTimeSchema, ModuleIdSchema, TenantIdSchema } from "@core/contracts";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { createContractConverter } from "#/services/shared/firestore/contract-converter.ts";
import type {
  ModuleSettingsKey,
  ModuleSettingsRepository,
  StoredModuleSettings,
} from "../../application/ports/driven/module-settings-repository.ts";

/** Top-level collection of the module settings store (decision 0015 §6); clients have no direct access (Rules). */
export const MODULE_SETTINGS_COLLECTION = "module-settings";

/** Stored shape version (contracts/firebase-firestore.md §17). */
const SCHEMA_VERSION = 1;

// Stored document: the record plus `schemaVersion`; values stay as the module contract parsed them.
const StoredModuleSettingsDocSchema = z.object({
  tenantId: TenantIdSchema,
  moduleId: ModuleIdSchema,
  values: z.record(z.string(), z.unknown()),
  schemaVersion: z.literal(SCHEMA_VERSION),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: IsoDateTimeSchema,
  updatedBy: z.string().min(1),
});
type StoredModuleSettingsDoc = z.infer<typeof StoredModuleSettingsDocSchema>;

const converter = createContractConverter({ schema: StoredModuleSettingsDocSchema });

/**
 * Deterministic id `{tenantId}_{moduleId}`: one singleton per tenant and module (decision 0015 §6,
 * the documented exception to automatic ids). Firestore ids never contain `/`, module ids are kebab.
 */
export const moduleSettingsDocId = (key: ModuleSettingsKey): string => `${key.tenantId}_${key.moduleId}`;

const toRecord = ({ schemaVersion, ...record }: StoredModuleSettingsDoc): StoredModuleSettings => {
  void schemaVersion;
  return record;
};

/** Firestore adapter of `ModuleSettingsRepository`; reads are parsed with the stored shape. */
export const createFirestoreModuleSettingsRepository = (deps: { firestore: Firestore }): ModuleSettingsRepository => {
  const refOf = (key: ModuleSettingsKey): DocumentReference<StoredModuleSettingsDoc> =>
    deps.firestore.collection(MODULE_SETTINGS_COLLECTION).doc(moduleSettingsDocId(key)).withConverter(converter);
  return {
    get: async (tx: Transaction | undefined, key) => {
      const snapshot = tx === undefined ? await refOf(key).get() : await tx.get(refOf(key));
      const data = snapshot.data();
      return data === undefined ? null : toRecord(data);
    },
    put: (tx, record) => {
      tx.set(refOf(record), { ...record, schemaVersion: SCHEMA_VERSION });
    },
  };
};
