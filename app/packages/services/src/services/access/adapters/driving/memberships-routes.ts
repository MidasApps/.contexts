import { grantMembershipEndpoint, listMembershipsEndpoint, revokeMembershipEndpoint, updateMembershipEndpoint } from "@core/contracts";
import { dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { AccessServices } from "../../composition.ts";
import type { MemberServices } from "../../member-composition.ts";
import { accessErrorResponse } from "./access-error-response.ts";

/**
 * `/v1` handlers of grants (SP1 spec §7.3): `GET|POST /organizations/{organizationId}/memberships`,
 * `PATCH|DELETE /memberships/{membershipId}`.
 */
export const buildMembershipsRoutes = (deps: { pipeline: ApiRouteDeps; access: AccessServices; members: MemberServices }): Record<string, RouteHandler> => {
  const { pipeline, access, members } = deps;
  return {
    [listMembershipsEndpoint.id]: withApiRoute(listMembershipsEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return invalidCursorResponse(requestId);
      const result = await members.listMemberships({ actor: principal, access: scope, tenantId: input.params.organizationId, principalId: input.query.principalId, page });
      return result.ok ? listResponse(result.data, page.limit) : accessErrorResponse(result.error, requestId);
    }),
    [grantMembershipEndpoint.id]: withApiRoute(grantMembershipEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const { userId, node, roles } = input.body;
      const result = await access.grantMembership({
        actor: principal,
        access: scope,
        tenantId: input.params.organizationId,
        principal: { type: "user", id: userId },
        node,
        roles,
        requestId,
      });
      if (!result.ok) return accessErrorResponse(result.error, requestId);
      return dataResponse({ data: result.data }, { status: 201, location: `/v1/memberships/${result.data.id}` });
    }),
    [updateMembershipEndpoint.id]: withApiRoute(updateMembershipEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await access.updateMembership({ actor: principal, access: scope, membershipId: input.params.membershipId, roles: input.body.roles, requestId });
      return result.ok ? dataResponse({ data: result.data }) : accessErrorResponse(result.error, requestId);
    }),
    [revokeMembershipEndpoint.id]: withApiRoute(revokeMembershipEndpoint, pipeline, async ({ principal, input, scope, requestId }) => {
      const result = await access.revokeMembership({ actor: principal, access: scope, membershipId: input.params.membershipId, requestId });
      return result.ok ? noContentResponse() : accessErrorResponse(result.error, requestId);
    }),
  };
};
