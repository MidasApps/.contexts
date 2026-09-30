import { listMembersEndpoint, removeMemberEndpoint } from "@core/contracts";
import { noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { MemberServices } from "../../member-composition.ts";
import { accessErrorResponse } from "./access-error-response.ts";

/**
 * `/v1` handlers of members (SP1 spec §7.3): `GET /organizations/{organizationId}/members`,
 * `DELETE /organizations/{organizationId}/members/{userId}`.
 */
export const buildMembersRoutes = (deps: { pipeline: ApiRouteDeps; members: MemberServices }): Record<string, RouteHandler> => {
  const { pipeline, members } = deps;
  return {
    [listMembersEndpoint.id]: withApiRoute(listMembersEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return invalidCursorResponse(requestId);
      const result = await members.listMembers({ actor: principal, access: scope, tenantId: input.params.organizationId, page });
      return result.ok ? listResponse(result.data, page.limit) : accessErrorResponse(result.error, requestId);
    }),
    [removeMemberEndpoint.id]: withApiRoute(removeMemberEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const { organizationId, userId } = input.params;
      const result = await members.removeMember({ actor: principal, access: scope, tenantId: organizationId, userId, requestId });
      return result.ok ? noContentResponse() : accessErrorResponse(result.error, requestId);
    }),
  };
};
