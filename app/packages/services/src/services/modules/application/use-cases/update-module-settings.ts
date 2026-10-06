import type { ModuleSettings, ModuleSettingsValues } from "@core/contracts";
import type { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { InvalidModuleSettingsError, type UnknownModuleError } from "../../domain/module-settings-errors.ts";
import {
  issuesToDetails,
  loadAuthorizedDefinition,
  type ModuleSettingsCommand,
  type ModuleSettingsDeps,
  toModuleSettings,
} from "../module-settings-deps.ts";
import type { StoredModuleSettings } from "../ports/driven/module-settings-repository.ts";

export type UpdateModuleSettingsCommand = ModuleSettingsCommand & {
  readonly values: ModuleSettingsValues;
  readonly requestId: string;
};

export type UpdateModuleSettings = (
  command: UpdateModuleSettingsCommand,
) => Promise<Result<ModuleSettings, UnknownModuleError | AccessDeniedError | InvalidModuleSettingsError>>;

// Audit `changes` hold field names only (ChangedFieldSchema); other keys are left out, never values.
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const MAX_CHANGES = 100;

const changedFields = (before: ModuleSettingsValues | undefined, after: ModuleSettingsValues): string[] =>
  [...new Set([...Object.keys(before ?? {}), ...Object.keys(after)])]
    .filter((field) => FIELD_NAME.test(field) && JSON.stringify(before?.[field]) !== JSON.stringify(after[field]))
    .toSorted()
    .slice(0, MAX_CHANGES);

/**
 * Replaces a module's settings (the manifest's `updatePermission`): authorize, validate with the
 * module's settings contract, then write the record and its audit entry in one transaction.
 */
export const makeUpdateModuleSettings =
  (deps: ModuleSettingsDeps): UpdateModuleSettings =>
  async (command) => {
    const allowed = await loadAuthorizedDefinition(deps, command, "updatePermission");
    if (!allowed.ok) return allowed;
    const parsed = allowed.data.contract.schema.safeParse(command.values);
    if (!parsed.success) return err(new InvalidModuleSettingsError(issuesToDetails(parsed.error)));
    const values = parsed.data as ModuleSettingsValues;
    const key = { tenantId: command.tenantId, moduleId: command.moduleId };
    const actor = auditActorOf(command.actor);
    const now = deps.clock.now().toISOString();
    const record = await deps.unitOfWork.run(async (tx) => {
      const existing = await deps.repository.get(tx, key);
      const next: StoredModuleSettings = {
        ...key,
        values,
        createdAt: existing?.createdAt ?? now,
        createdBy: existing?.createdBy ?? actor.id,
        updatedAt: now,
        updatedBy: actor.id,
      };
      deps.repository.put(tx, next);
      await deps.audit.record(
        {
          log: "tenant",
          tenantId: command.tenantId,
          action: "MODULE_SETTINGS_UPDATED",
          actor,
          target: { type: "module-settings", id: command.moduleId },
          node: { level: "organization", tenantId: command.tenantId },
          outcome: "success",
          requestId: command.requestId,
          changes: changedFields(existing?.values, values),
        },
        tx,
      );
      return next;
    });
    return ok(toModuleSettings(key, record));
  };
