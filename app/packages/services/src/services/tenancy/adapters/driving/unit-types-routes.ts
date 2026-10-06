import { listUnitTypesEndpoint } from "@core/contracts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "#/services/shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { TenancyServices } from "../../composition.ts";

/** `GET /v1/unit-types`: the unit types of the installed modules (any user). */
export const buildUnitTypesRoutes = (deps: {
  pipeline: ApiRouteDeps;
  tenancy: TenancyServices;
}): Record<string, RouteHandler> => ({
  [listUnitTypesEndpoint.id]: withApiRoute(listUnitTypesEndpoint, deps.pipeline, ({ input, requestId }) => {
    const page = pageRequestOf(input.query);
    if (page === null) return Promise.resolve(invalidCursorResponse(requestId));
    return Promise.resolve(listResponse(deps.tenancy.listUnitTypes(page), page.limit));
  }),
});
