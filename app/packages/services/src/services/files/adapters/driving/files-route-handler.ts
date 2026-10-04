import { getFileEndpoint, getFileReadUrlEndpoint, requestFileUploadEndpoint } from "@core/contracts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { FilesServices } from "../../composition.ts";

/**
 * `/v1` handlers of files (SP3 Task 13): `POST /organizations/{organizationId}/files`,
 * `GET /files/{fileId}`, `GET /files/{fileId}/read-url`. Auth and validation run in the
 * pipeline; the use cases check the upload policy and authorize before any side effect.
 */
export const buildFilesRoutes = (deps: {
  pipeline: ApiRouteDeps;
  files: FilesServices;
}): Record<string, RouteHandler> => {
  const { pipeline, files } = deps;
  return {
    [requestFileUploadEndpoint.id]: withApiRoute(
      requestFileUploadEndpoint,
      pipeline,
      async ({ principal, input, authorize, requestId }) => {
        const result = await files.requestUpload({
          principal,
          authorize,
          tenantId: input.params.organizationId,
          request: input.body,
        });
        if (result.ok)
          return dataResponse({ data: result.data }, { status: 201, location: `/v1/files/${result.data.fileId}` });
        if (result.error.code === "FORBIDDEN") return apiError(403, "FORBIDDEN", requestId);
        return apiError(400, "VALIDATION_FAILED", requestId, [
          { field: result.error.field, issue: result.error.reason },
        ]);
      },
    ),
    [getFileEndpoint.id]: withApiRoute(
      getFileEndpoint,
      pipeline,
      async ({ principal, input, authorize, requestId }) => {
        const result = await files.getFile({ principal, authorize, fileId: input.params.fileId });
        return result.ok ? dataResponse({ data: result.data }) : apiError(404, "NOT_FOUND", requestId);
      },
    ),
    [getFileReadUrlEndpoint.id]: withApiRoute(
      getFileReadUrlEndpoint,
      pipeline,
      async ({ principal, input, authorize, requestId }) => {
        const result = await files.createReadUrl({ principal, authorize, fileId: input.params.fileId });
        if (result.ok) return dataResponse({ data: result.data });
        return result.error.code === "FILE_NOT_READY"
          ? apiError(409, "CONFLICT", requestId)
          : apiError(404, "NOT_FOUND", requestId);
      },
    ),
  };
};
