import {
  acceptInvitationEndpoint,
  createInvitationEndpoint,
  listInvitationsEndpoint,
  previewInvitationEndpoint,
  revokeInvitationEndpoint,
} from "@core/contracts";
import { dataResponse, noContentResponse } from "#/services/shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "#/services/shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { MemberServices } from "../../member-composition.ts";
import { accessErrorResponse } from "./access-error-response.ts";

/**
 * `/v1` handlers of invitations (SP1 spec §6.2, §7.3): `GET|POST
 * /organizations/{organizationId}/invitations`, `DELETE /invitations/{invitationId}`,
 * `POST /invitations/preview`, `POST /invitations/accept`.
 */
export const buildInvitationsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  members: MemberServices;
}): Record<string, RouteHandler> => {
  const { pipeline, members } = deps;
  return {
    [listInvitationsEndpoint.id]: withApiRoute(
      listInvitationsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        const result = await members.listInvitations({
          actor: principal,
          access: scope,
          tenantId: input.params.organizationId,
          status: input.query.status,
          page,
        });
        return result.ok ? listResponse(result.data, page.limit) : accessErrorResponse(result.error, requestId);
      },
    ),
    [createInvitationEndpoint.id]: withApiRoute(
      createInvitationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await members.createInvitation({
          actor: principal,
          access: scope,
          tenantId: input.params.organizationId,
          input: input.body,
          requestId,
        });
        if (!result.ok) return accessErrorResponse(result.error, requestId);
        // The resource URL (DELETE revokes it); the accept link is in this response only.
        return dataResponse(
          { data: result.data },
          { status: 201, location: `/v1/invitations/${result.data.invitation.id}` },
        );
      },
    ),
    [revokeInvitationEndpoint.id]: withApiRoute(
      revokeInvitationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await members.revokeInvitation({
          actor: principal,
          access: scope,
          invitationId: input.params.invitationId,
          requestId,
        });
        return result.ok ? noContentResponse() : accessErrorResponse(result.error, requestId);
      },
    ),
    [previewInvitationEndpoint.id]: withApiRoute(previewInvitationEndpoint, pipeline, async ({ input, requestId }) => {
      const result = await members.previewInvitation({ token: input.body.token });
      return result.ok ? dataResponse({ data: result.data }) : accessErrorResponse(result.error, requestId);
    }),
    [acceptInvitationEndpoint.id]: withApiRoute(
      acceptInvitationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await members.acceptInvitation({
          actor: principal,
          access: scope,
          token: input.body.token,
          requestId,
        });
        return result.ok ? dataResponse({ data: result.data }) : accessErrorResponse(result.error, requestId);
      },
    ),
  };
};
