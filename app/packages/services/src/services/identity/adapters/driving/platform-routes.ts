import { endImpersonationEndpoint, startImpersonationEndpoint } from "@core/contracts";
import { accessErrorResponse } from "../../../access/adapters/driving/access-error-response.ts";
import { dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { PlatformServices } from "../../platform-composition.ts";

/**
 * `/v1/platform` handlers (SP1 spec §6.6, §7.3): `POST /platform/impersonation-sessions` (201
 * with the one-time custom token) and
 * `POST /platform/impersonation-sessions/{sessionId}/end` (204, idempotent). Both need
 * `platform.user.impersonate` with MFA: 403 `MFA_REQUIRED` without it, 404 for non-staff.
 */
export const buildPlatformRoutes = (deps: { pipeline: ApiRouteDeps; platform: PlatformServices }): Record<string, RouteHandler> => {
  const { pipeline, platform } = deps;
  return {
    [startImpersonationEndpoint.id]: withApiRoute(startImpersonationEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await platform.startImpersonation({ actor: principal, access: scope, input: input.body, requestId });
      if (!result.ok) return accessErrorResponse(result.error, requestId);
      return dataResponse({ data: result.data }, { status: 201, location: `/v1/platform/impersonation-sessions/${result.data.sessionId}` });
    }),
    [endImpersonationEndpoint.id]: withApiRoute(endImpersonationEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await platform.endImpersonation({ actor: principal, access: scope, sessionId: input.params.sessionId, requestId });
      return result.ok ? noContentResponse() : accessErrorResponse(result.error, requestId);
    }),
  };
};
