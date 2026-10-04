import {
  type AccessContext,
  type AccessContextQuery,
  getAccessContextEndpoint,
  getMeEndpoint,
  listMyGrantsEndpoint,
  listMyOrganizationsEndpoint,
  setActiveOrganizationEndpoint,
  syncClaimsEndpoint,
  type TenantNodeRef,
  updateMeEndpoint,
} from "@core/contracts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse, invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { AccessContextResolution } from "../../application/use-cases/resolve-access-context.ts";
import type { IdentityServices } from "../../composition.ts";
import type { AccountMissingError } from "../../domain/errors/account-missing-error.ts";

/** Denial → 404/403 (`deniedResponse`); a token without an account → 401. */
const meErrorResponse = (error: AccessDeniedError | AccountMissingError, requestId: string): Response =>
  error instanceof AccessDeniedError
    ? deniedResponse(error.reason, requestId)
    : apiError(401, "UNAUTHORIZED", requestId);

const nodeOf = (query: AccessContextQuery): TenantNodeRef => {
  const tenantId = query.organizationId;
  if (query.projectId === undefined) return { level: "organization", tenantId };
  if (query.unitId === undefined) return { level: "project", tenantId, projectId: query.projectId };
  return { level: "unit", tenantId, projectId: query.projectId, unitId: query.unitId };
};

const accessContextView = ({ context, details }: AccessContextResolution): AccessContext => ({
  tenantId: context.tenantId,
  organization: details.organization,
  ...(details.project === undefined ? {} : { project: details.project }),
  ...(details.unit === undefined ? {} : { unit: details.unit }),
  permissions: [...context.permissions],
  regional: context.regional,
});

/**
 * `/v1/me*` handlers (SP1 spec §7.3): `GET|PATCH /me`, `PUT /me/active-organization`,
 * `POST /me/claims/sync`, `GET /me/organizations`, `GET /me/grants`, `GET /me/context`.
 */
export const buildMeRoutes = (deps: {
  pipeline: ApiRouteDeps;
  identity: IdentityServices;
}): Record<string, RouteHandler> => {
  const { pipeline, identity } = deps;
  return {
    [getMeEndpoint.id]: withApiRoute(getMeEndpoint, pipeline, async ({ principal, requestId }) => {
      const result = await identity.getMe({ actor: principal });
      return result.ok ? dataResponse({ data: result.data }) : meErrorResponse(result.error, requestId);
    }),
    [updateMeEndpoint.id]: withApiRoute(updateMeEndpoint, pipeline, async ({ principal, input, requestId }) => {
      const result = await identity.updateMe({ actor: principal, input: input.body });
      return result.ok ? dataResponse({ data: result.data }) : meErrorResponse(result.error, requestId);
    }),
    [setActiveOrganizationEndpoint.id]: withApiRoute(
      setActiveOrganizationEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await identity.setActiveOrganization({
          actor: principal,
          access: scope,
          organizationId: input.body.organizationId,
          requestId,
        });
        return result.ok ? noContentResponse() : meErrorResponse(result.error, requestId);
      },
    ),
    [syncClaimsEndpoint.id]: withApiRoute(syncClaimsEndpoint, pipeline, async ({ principal, requestId }) => {
      // syncClaims logged the failure (`claims_sync_failed`); the client may retry.
      return (await identity.syncClaims(principal.uid))
        ? noContentResponse()
        : apiError(500, "INTERNAL_ERROR", requestId);
    }),
    [listMyOrganizationsEndpoint.id]: withApiRoute(
      listMyOrganizationsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        return listResponse(await identity.listMyOrganizations({ actor: principal, access: scope, page }), page.limit);
      },
    ),
    [listMyGrantsEndpoint.id]: withApiRoute(
      listMyGrantsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        const result = await identity.listMyGrants({
          actor: principal,
          access: scope,
          organizationId: input.query.organizationId,
          page,
        });
        return result.ok ? listResponse(result.data, page.limit) : meErrorResponse(result.error, requestId);
      },
    ),
    [getAccessContextEndpoint.id]: withApiRoute(
      getAccessContextEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await identity.loadAccessContext({ principal, node: nodeOf(input.query), access: scope });
        return result.ok
          ? dataResponse({ data: accessContextView(result.data) })
          : meErrorResponse(result.error, requestId);
      },
    ),
  };
};
