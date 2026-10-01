import { ModuleSettingsSchema, type ErrorDetail, type ModuleSettings, type Principal, type TenantId } from "@core/contracts";
import type { z } from "zod";
import type { RequestAccess } from "../../access/composition.ts";
import { AccessDeniedError } from "../../access/domain/errors/access-denied-error.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import type { ModuleSettingsDefinition, ModuleSettingsRegistry } from "../domain/module-settings-registry.ts";
import { UnknownModuleError } from "../domain/module-settings-errors.ts";
import type { ModuleSettingsKey, ModuleSettingsRepository, StoredModuleSettings } from "./ports/driven/module-settings-repository.ts";

/** Dependencies of the module settings use cases, built by `createModuleSettingsServices`. */
export type ModuleSettingsDeps = {
  readonly registry: ModuleSettingsRegistry;
  readonly repository: ModuleSettingsRepository;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
};

/** Who asks, with this request's access scope, for which module's settings in which organization. */
export type ModuleSettingsCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly moduleId: string;
};

/**
 * Finds the module's settings definition and authorizes its read or update permission at the
 * organization (fail-closed). An unknown module fails before any access read.
 */
export const loadAuthorizedDefinition = async (
  deps: Pick<ModuleSettingsDeps, "registry">,
  command: ModuleSettingsCommand,
  permission: "readPermission" | "updatePermission",
): Promise<Result<ModuleSettingsDefinition, UnknownModuleError | AccessDeniedError>> => {
  const definition = deps.registry.get(command.moduleId);
  if (definition === undefined) return err(new UnknownModuleError(command.moduleId));
  const decision = await command.access.authorize({
    principal: command.actor,
    permission: definition[permission],
    node: { level: "organization", tenantId: command.tenantId },
  });
  return decision.allowed ? ok(definition) : err(new AccessDeniedError(decision.reason));
};

/**
 * The wire view of a stored record; `null` values until the first save.
 * @throws {ZodError} when the record breaks the view contract (a bug: stored records are parsed on read).
 */
export const toModuleSettings = (key: ModuleSettingsKey, stored: StoredModuleSettings | null): ModuleSettings =>
  ModuleSettingsSchema.parse({
    tenantId: key.tenantId,
    moduleId: key.moduleId,
    values: stored?.values ?? null,
    updatedAt: stored?.updatedAt ?? null,
    updatedBy: stored?.updatedBy ?? null,
  });

/** Zod issues → `VALIDATION_FAILED` details, the same shape the `/v1` pipeline reports for a body. */
export const issuesToDetails = (error: z.ZodError): ErrorDetail[] =>
  error.issues.map((issue) => ({ field: issue.path.length === 0 ? "(body)" : issue.path.map(String).join("."), issue: issue.code.toUpperCase() }));
