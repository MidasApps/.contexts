import {
  createProjectEndpoint,
  deleteProjectEndpoint,
  getProjectEndpoint,
  listProjectsEndpoint,
  updateProjectEndpoint,
} from "@core/contracts";
import { dataResponse, noContentResponse } from "#/services/shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "#/services/shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { TenancyServices } from "../../composition.ts";
import { tenancyErrorResponse } from "./tenancy-error-response.ts";

/**
 * `/v1` handlers of projects: `GET|POST /organizations/{organizationId}/projects`,
 * `GET|PATCH|DELETE /projects/{projectId}`.
 */
export const buildProjectsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  tenancy: TenancyServices;
}): Record<string, RouteHandler> => {
  const { pipeline, tenancy } = deps;
  return {
    [listProjectsEndpoint.id]: withApiRoute(
      listProjectsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        const result = await tenancy.listProjects({
          actor: principal,
          access: scope,
          tenantId: input.params.organizationId,
          page,
        });
        return result.ok ? listResponse(result.data, page.limit) : tenancyErrorResponse(result.error, requestId);
      },
    ),
    [createProjectEndpoint.id]: withApiRoute(
      createProjectEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.createProject({
          actor: principal,
          access: scope,
          requestId,
          tenantId: input.params.organizationId,
          input: input.body,
        });
        if (!result.ok) return tenancyErrorResponse(result.error, requestId);
        return dataResponse({ data: result.data }, { status: 201, location: `/v1/projects/${result.data.id}` });
      },
    ),
    [getProjectEndpoint.id]: withApiRoute(
      getProjectEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.getProject({ actor: principal, access: scope, projectId: input.params.projectId });
        return result.ok ? dataResponse({ data: result.data }) : tenancyErrorResponse(result.error, requestId);
      },
    ),
    [updateProjectEndpoint.id]: withApiRoute(
      updateProjectEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.updateProject({
          actor: principal,
          access: scope,
          requestId,
          projectId: input.params.projectId,
          input: input.body,
        });
        return result.ok ? dataResponse({ data: result.data }) : tenancyErrorResponse(result.error, requestId);
      },
    ),
    [deleteProjectEndpoint.id]: withApiRoute(
      deleteProjectEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await tenancy.deleteProject({
          actor: principal,
          access: scope,
          requestId,
          projectId: input.params.projectId,
        });
        return result.ok ? noContentResponse() : tenancyErrorResponse(result.error, requestId);
      },
    ),
  };
};
