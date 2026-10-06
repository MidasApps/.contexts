import type { ErrorDetail } from "@core/contracts";

/** No installed module declares settings under this id → 404 NOT_FOUND. */
export class UnknownModuleError extends Error {
  readonly code = "UNKNOWN_MODULE";
  readonly moduleId: string;

  constructor(moduleId: string, options?: ErrorOptions) {
    super(`unknown module: ${moduleId}`, options);
    this.name = "UnknownModuleError";
    this.moduleId = moduleId;
  }
}

/** The values fail the module's settings contract → 400 VALIDATION_FAILED with one detail per issue. */
export class InvalidModuleSettingsError extends Error {
  readonly code = "INVALID_MODULE_SETTINGS";
  readonly details: readonly ErrorDetail[];

  constructor(details: readonly ErrorDetail[], options?: ErrorOptions) {
    super("module settings are invalid", options);
    this.name = "InvalidModuleSettingsError";
    this.details = details;
  }
}
