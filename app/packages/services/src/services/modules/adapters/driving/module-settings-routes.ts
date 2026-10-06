import { getModuleSettingsEndpoint, updateModuleSettingsEndpoint } from "@core/contracts";
import { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { apiError, dataResponse } from "#/services/shared/http/api-errors.ts";
import { deniedResponse } from "#/services/shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { ModuleSettingsServices } from "../../composition.ts";
import { InvalidModuleSettingsError, UnknownModuleError } from "../../domain/module-settings-errors.ts";

/** Maps the expected module settings errors; anything else is a bug and reaches the boundary (500). */
const moduleSettingsErrorResponse = (error: Error, requestId: string): Response => {
  if (error instanceof UnknownModuleError) return apiError(404, "NOT_FOUND", requestId);
  if (error instanceof AccessDeniedError) return deniedResponse(error.reason, requestId);
  if (error instanceof InvalidModuleSettingsError)
    return apiError(400, "VALIDATION_FAILED", requestId, [...error.details]);
  throw error;
};

/**
 * `/v1` handlers of `GET|PUT /organizations/{organizationId}/module-settings/{moduleId}`
 * (decision 0015 §6): 200, 404 unknown module or hidden organization, 403 without the
 * manifest permission, 400 with field details when the values fail the module contract.
 */
export const buildModuleSettingsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  moduleSettings: ModuleSettingsServices;
}): Record<string, RouteHandler> => {
  const { pipeline, moduleSettings } = deps;
  return {
    [getModuleSettingsEndpoint.id]: withApiRoute(
      getModuleSettingsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const { organizationId, moduleId } = input.params;
        const result = await moduleSettings.getModuleSettings({
          actor: principal,
          access: scope,
          tenantId: organizationId,
          moduleId,
        });
        return result.ok ? dataResponse({ data: result.data }) : moduleSettingsErrorResponse(result.error, requestId);
      },
    ),
    [updateModuleSettingsEndpoint.id]: withApiRoute(
      updateModuleSettingsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const { organizationId, moduleId } = input.params;
        const result = await moduleSettings.updateModuleSettings({
          actor: principal,
          access: scope,
          tenantId: organizationId,
          moduleId,
          values: input.body,
          requestId,
        });
        return result.ok ? dataResponse({ data: result.data }) : moduleSettingsErrorResponse(result.error, requestId);
      },
    ),
  };
};
