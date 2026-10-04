import type { ModuleSettings } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { UnknownModuleError } from "../../domain/module-settings-errors.ts";
import {
  loadAuthorizedDefinition,
  type ModuleSettingsCommand,
  type ModuleSettingsDeps,
  toModuleSettings,
} from "../module-settings-deps.ts";

export type GetModuleSettings = (
  command: ModuleSettingsCommand,
) => Promise<Result<ModuleSettings, UnknownModuleError | AccessDeniedError>>;

/** Reads a module's settings in an organization (the manifest's `readPermission`). */
export const makeGetModuleSettings =
  (deps: Pick<ModuleSettingsDeps, "registry" | "repository">): GetModuleSettings =>
  async (command) => {
    const allowed = await loadAuthorizedDefinition(deps, command, "readPermission");
    if (!allowed.ok) return allowed;
    const key = { tenantId: command.tenantId, moduleId: command.moduleId };
    return ok(toModuleSettings(key, await deps.repository.get(undefined, key)));
  };
