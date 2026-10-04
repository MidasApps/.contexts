import {
  createUnitEndpoint,
  deleteUnitEndpoint,
  getUnitEndpoint,
  listUnitsEndpoint,
  updateUnitEndpoint,
} from "@core/contracts";
import { dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { TenancyServices } from "../../composition.ts";
import { tenancyErrorResponse } from "./tenancy-error-response.ts";

/**
 * `/v1` handlers of the unit tree: `GET|POST /projects/{projectId}/units?parentUnitId=`,
 * `GET|PATCH|DELETE /units/{unitId}`.
 */
export const buildUnitsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  tenancy: TenancyServices;
}): Record<string, RouteHandler> => {
  const { pipeline, tenancy } = deps;
  return {
    [listUnitsEndpoint.id]: withApiRoute(
      listUnitsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        const parentUnitId = input.query.parentUnitId ?? null;
        const result = await tenancy.listUnits({
          actor: principal,
          access: scope,
          projectId: input.params.projectId,
          parentUnitId,
          page,
        });
        return result.ok ? listResponse(result.data, page.limit) : tenancyErrorResponse(result.error, requestId);
      },
    ),
    [createUnitEndpoint.id]: withApiRoute(
      createUnitEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.createUnit({
          actor: principal,
          access: scope,
          requestId,
          projectId: input.params.projectId,
          input: input.body,
        });
        if (!result.ok) return tenancyErrorResponse(result.error, requestId);
        return dataResponse({ data: result.data }, { status: 201, location: `/v1/units/${result.data.id}` });
      },
    ),
    [getUnitEndpoint.id]: withApiRoute(getUnitEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await tenancy.getUnit({ actor: principal, access: scope, unitId: input.params.unitId });
      return result.ok ? dataResponse({ data: result.data }) : tenancyErrorResponse(result.error, requestId);
    }),
    [updateUnitEndpoint.id]: withApiRoute(
      updateUnitEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.updateUnit({
          actor: principal,
          access: scope,
          requestId,
          unitId: input.params.unitId,
          input: input.body,
        });
        return result.ok ? dataResponse({ data: result.data }) : tenancyErrorResponse(result.error, requestId);
      },
    ),
    [deleteUnitEndpoint.id]: withApiRoute(
      deleteUnitEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.deleteUnit({
          actor: principal,
          access: scope,
          requestId,
          unitId: input.params.unitId,
        });
        return result.ok ? noContentResponse() : tenancyErrorResponse(result.error, requestId);
      },
    ),
  };
};
