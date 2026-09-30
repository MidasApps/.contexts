import {
  createRoleEndpoint,
  deleteRoleEndpoint,
  getRoleEndpoint,
  listPermissionsEndpoint,
  listRolesEndpoint,
  updateRoleEndpoint,
} from "@core/contracts";
import { dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import { paginateInMemory } from "../../../shared/pagination/page.ts";
import type { AccessServices } from "../../composition.ts";
import { accessErrorResponse } from "./access-error-response.ts";

/**
 * `/v1` handlers of permissions and custom roles (SP1 spec §7.3): `GET /permissions`,
 * `GET|POST /organizations/{organizationId}/roles`, `GET|PATCH|DELETE /roles/{roleId}`.
 */
export const buildRolesRoutes = (deps: { pipeline: ApiRouteDeps; access: AccessServices }): Record<string, RouteHandler> => {
  const { pipeline, access } = deps;
  return {
    [listPermissionsEndpoint.id]: withApiRoute(listPermissionsEndpoint, pipeline, ({ input, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return Promise.resolve(invalidCursorResponse(requestId));
      const permissions = access.registry.listTenantPermissions();
      return Promise.resolve(listResponse(paginateInMemory({ items: permissions, page, positionOf: (p) => [p.id, p.id] }), page.limit));
    }),
    [listRolesEndpoint.id]: withApiRoute(listRolesEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return invalidCursorResponse(requestId);
      const result = await access.listRoles({ actor: principal, access: scope, tenantId: input.params.organizationId, page });
      return result.ok ? listResponse(result.data, page.limit) : accessErrorResponse(result.error, requestId);
    }),
    [createRoleEndpoint.id]: withApiRoute(createRoleEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await access.createRole({ actor: principal, access: scope, tenantId: input.params.organizationId, input: input.body, requestId });
      if (!result.ok) return accessErrorResponse(result.error, requestId);
      return dataResponse({ data: result.data }, { status: 201, location: `/v1/roles/${result.data.id}` });
    }),
    [getRoleEndpoint.id]: withApiRoute(getRoleEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await access.getRole({ actor: principal, access: scope, roleId: input.params.roleId });
      return result.ok ? dataResponse({ data: result.data }) : accessErrorResponse(result.error, requestId);
    }),
    [updateRoleEndpoint.id]: withApiRoute(updateRoleEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await access.updateRole({ actor: principal, access: scope, roleId: input.params.roleId, input: input.body, requestId });
      return result.ok ? dataResponse({ data: result.data }) : accessErrorResponse(result.error, requestId);
    }),
    [deleteRoleEndpoint.id]: withApiRoute(deleteRoleEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await access.deleteRole({ actor: principal, access: scope, roleId: input.params.roleId, requestId });
      return result.ok ? noContentResponse() : accessErrorResponse(result.error, requestId);
    }),
  };
};
