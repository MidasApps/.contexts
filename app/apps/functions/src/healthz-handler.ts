import { errorResponse, type Logger, withRouteBoundary } from "@core/services";
import { makeHealthRouteHandler } from "@core/services/platform/health-route-handler";
import type { WebHandler } from "./http/express-web-bridge.ts";

const ALLOWED_METHOD = "GET";

/**
 * Liveness of the Functions codebase, same contract as web `GET /v1/health`
 * (app/docs/decisions/0003-public-liveness-endpoint.md): public, fixed body,
 * no dependency checks. Next answers other methods with 405 by itself;
 * `onRequest` does not, so this handler does it with the error envelope.
 */
export const makeHealthzHandler = (deps: { logger: Logger }): WebHandler => {
  const checkHealth = makeHealthRouteHandler(deps);
  const rejectMethod = withRouteBoundary(
    { operation: "health_method_rejected", logger: deps.logger },
    (_request, { requestId }) => {
      const response = errorResponse({ status: 405, code: "METHOD_NOT_ALLOWED", message: "Method not allowed.", requestId });
      response.headers.set("allow", ALLOWED_METHOD);
      return Promise.resolve(response);
    },
  );
  return (request) => (request.method === ALLOWED_METHOD ? checkHealth(request) : rejectMethod(request));
};
