import { createDeviceActivationEndpoint, listDevicesEndpoint, redeemDeviceActivationEndpoint, revokeDeviceEndpoint } from "@core/contracts";
import { accessErrorResponse } from "../../../access/adapters/driving/access-error-response.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { DeviceServices } from "../../device-composition.ts";

/**
 * `/v1` device handlers (SP1 spec §6.4, §7.3): `GET /organizations/{organizationId}/devices`,
 * `DELETE /devices/{deviceId}`, `POST /organizations/{organizationId}/device-activations`,
 * `POST /device-activations/redeem` (no auth; failures counted per IP by the pipeline).
 */
export const buildDevicesRoutes = (deps: { pipeline: ApiRouteDeps; devices: DeviceServices }): Record<string, RouteHandler> => {
  const { pipeline, devices } = deps;
  return {
    [listDevicesEndpoint.id]: withApiRoute(listDevicesEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return invalidCursorResponse(requestId);
      const result = await devices.listDevices({ actor: principal, access: scope, tenantId: input.params.organizationId, page });
      return result.ok ? listResponse(result.data, page.limit) : accessErrorResponse(result.error, requestId);
    }),
    [revokeDeviceEndpoint.id]: withApiRoute(revokeDeviceEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await devices.revokeDevice({ actor: principal, access: scope, deviceId: input.params.deviceId, requestId });
      return result.ok ? noContentResponse() : accessErrorResponse(result.error, requestId);
    }),
    [createDeviceActivationEndpoint.id]: withApiRoute(createDeviceActivationEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await devices.createDeviceActivation({ actor: principal, access: scope, tenantId: input.params.organizationId, input: input.body, requestId });
      if (!result.ok) return accessErrorResponse(result.error, requestId);
      // The code is in this response only; the activation expires by itself (TTL).
      return dataResponse({ data: result.data }, { status: 201, location: `/v1/device-activations/${result.data.id}` });
    }),
    [redeemDeviceActivationEndpoint.id]: withApiRoute(redeemDeviceActivationEndpoint, pipeline, async ({ input, requestId, logger }) => {
      const result = await devices.redeemDeviceActivation({ code: input.body.code, requestId });
      if (result.ok) return dataResponse({ data: result.data });
      logger.info("device_redeem_refused", { requestId, reason: result.error.reason });
      return apiError(401, "UNAUTHORIZED", requestId);
    }),
  };
};
