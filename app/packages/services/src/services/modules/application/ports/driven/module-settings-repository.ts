import type { ModuleSettingsValues, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/** One module's settings in one organization, as stored (`module-settings/{tenantId}_{moduleId}`). */
export type StoredModuleSettings = {
  readonly tenantId: TenantId;
  readonly moduleId: string;
  readonly values: ModuleSettingsValues;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type ModuleSettingsKey = { readonly tenantId: TenantId; readonly moduleId: string };

/** Driven port of the module settings store (decision 0015 §6): a singleton per tenant and module. */
export type ModuleSettingsRepository = {
  /** Reads inside `tx` when given (read-before-write), otherwise on its own. */
  readonly get: (tx: Transaction | undefined, key: ModuleSettingsKey) => Promise<StoredModuleSettings | null>;
  /** Writes the whole record (create or replace) inside `tx`. */
  readonly put: (tx: Transaction, record: StoredModuleSettings) => void;
};
