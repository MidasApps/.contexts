import { createApiKeyEndpoint, listApiKeysEndpoint, revokeApiKeyEndpoint } from "@core/contracts";
import { accessErrorResponse } from "../../../access/adapters/driving/access-error-response.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { ApiKeyServices } from "../../api-key-composition.ts";
import { ApiKeyExpiryInvalidError } from "../../domain/errors/api-key-errors.ts";

const apiKeyErrorResponse = (error: Error & { readonly code: string }, requestId: string): Response => {
  if (error instanceof ApiKeyExpiryInvalidError)
    return apiError(400, "VALIDATION_FAILED", requestId, [{ field: "expiresAt", issue: error.issue }]);
  // Denials, escalation and 404 share the access mapping (404 hides other tenants' keys).
  return accessErrorResponse(error, requestId);
};

/**
 * `/v1` API key handlers (SP1 spec §6.3, §7.3): `GET|POST /organizations/{organizationId}/api-keys`,
 * `DELETE /api-keys/{apiKeyId}`. The full key appears only in the 201 of creation.
 */
export const buildApiKeysRoutes = (deps: {
  pipeline: ApiRouteDeps;
  apiKeys: ApiKeyServices;
}): Record<string, RouteHandler> => {
  const { pipeline, apiKeys } = deps;
  return {
    [listApiKeysEndpoint.id]: withApiRoute(
      listApiKeysEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        const result = await apiKeys.listApiKeys({
          actor: principal,
          access: scope,
          tenantId: input.params.organizationId,
          page,
        });
        return result.ok ? listResponse(result.data, page.limit) : apiKeyErrorResponse(result.error, requestId);
      },
    ),
    [createApiKeyEndpoint.id]: withApiRoute(
      createApiKeyEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await apiKeys.createApiKey({
          actor: principal,
          access: scope,
          tenantId: input.params.organizationId,
          input: input.body,
          requestId,
        });
        if (!result.ok) return apiKeyErrorResponse(result.error, requestId);
        return dataResponse({ data: result.data }, { status: 201, location: `/v1/api-keys/${result.data.apiKey.id}` });
      },
    ),
    [revokeApiKeyEndpoint.id]: withApiRoute(
      revokeApiKeyEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await apiKeys.revokeApiKey({
          actor: principal,
          access: scope,
          apiKeyId: input.params.apiKeyId,
          requestId,
        });
        return result.ok ? noContentResponse() : apiKeyErrorResponse(result.error, requestId);
      },
    ),
  };
};
