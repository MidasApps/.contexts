import {
  createOrganizationEndpoint,
  deleteOrganizationEndpoint,
  getOrganizationEndpoint,
  updateOrganizationEndpoint,
} from "@core/contracts";
import { dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { TenancyServices } from "../../composition.ts";
import { tenancyErrorResponse } from "./tenancy-error-response.ts";

/** `/v1` handlers of organizations: `POST /organizations`, `GET|PATCH|DELETE /organizations/{organizationId}`. */
export const buildOrganizationsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  tenancy: TenancyServices;
}): Record<string, RouteHandler> => {
  const { pipeline, tenancy } = deps;
  return {
    [createOrganizationEndpoint.id]: withApiRoute(
      createOrganizationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.createOrganization({
          actor: principal,
          access: scope,
          requestId,
          input: input.body,
        });
        if (!result.ok) return tenancyErrorResponse(result.error, requestId);
        return dataResponse({ data: result.data }, { status: 201, location: `/v1/organizations/${result.data.id}` });
      },
    ),
    [getOrganizationEndpoint.id]: withApiRoute(
      getOrganizationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.getOrganization({
          actor: principal,
          access: scope,
          organizationId: input.params.organizationId,
        });
        return result.ok ? dataResponse({ data: result.data }) : tenancyErrorResponse(result.error, requestId);
      },
    ),
    [updateOrganizationEndpoint.id]: withApiRoute(
      updateOrganizationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.updateOrganization({
          actor: principal,
          access: scope,
          requestId,
          organizationId: input.params.organizationId,
          input: input.body,
        });
        return result.ok ? dataResponse({ data: result.data }) : tenancyErrorResponse(result.error, requestId);
      },
    ),
    [deleteOrganizationEndpoint.id]: withApiRoute(
      deleteOrganizationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.deleteOrganization({
          actor: principal,
          access: scope,
          requestId,
          organizationId: input.params.organizationId,
        });
        return result.ok ? noContentResponse() : tenancyErrorResponse(result.error, requestId);
      },
    ),
  };
};
