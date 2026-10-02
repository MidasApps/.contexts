import { errorResponse, type Logger, withRouteBoundary } from "@core/services";
import { makeHealthRouteHandler } from "@core/services/platform/health-route-handler";
import type { WebHandler } from "./http/express-web-bridge.ts";

// HEAD lets probes skip the body; Node drops the body of a HEAD response on the wire.
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const ALLOW_HEADER = [...ALLOWED_METHODS].join(", ");

/**
 * Liveness of the Functions codebase, same contract as web `GET /v1/health` plus HEAD
 * (app/docs/decisions/0003-public-liveness-endpoint.md): public, fixed body,
 * no dependency checks. Next answers other methods with 405 by itself;
 * `onRequest` does not, so this handler does it with the error envelope.
 */
export const makeHealthzHandler = (deps: { logger: Logger }): WebHandler => {
  const checkHealth = makeHealthRouteHandler(deps);
  const rejectMethod = withRouteBoundary(
    { operation: "health_method", logger: deps.logger },
    (_request, { requestId }) => {
      const response = errorResponse({ status: 405, code: "METHOD_NOT_ALLOWED", message: "Method not allowed.", requestId });
      response.headers.set("allow", ALLOW_HEADER);
      return Promise.resolve(response);
    },
  );
  return (request) => (ALLOWED_METHODS.has(request.method) ? checkHealth(request) : rejectMethod(request));
};
