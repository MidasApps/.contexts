import { CORE_ENDPOINTS } from "@core/contracts";
import type { ApiRouteDeps } from "./shared/http/api-route.ts";
import { errorResponse } from "./shared/http/error-envelope.ts";
import type { RouteHandler } from "./shared/http/route-boundary.ts";
import type { Logger } from "./shared/observability/logger.ts";
import { REQUEST_ID_HEADER, resolveRequestId } from "./shared/observability/request-id.ts";

/** Route handlers keyed by endpoint id (`identity.getMe`), as declared in `CORE_ENDPOINTS`. */
export type CoreRoutes = Readonly<Record<string, RouteHandler>>;

/**
 * The `/v1` route table. Each vertical (SP1 Tasks 10–18) adds its handlers here with
 * `withApiRoute(<endpoint>, deps, <handler>)`; the web app's `route(endpointId)` looks
 * them up. Empty until the first vertical lands.
 */
export const buildCoreRoutes = (deps: ApiRouteDeps): CoreRoutes => {
  void deps;
  return {};
};

/** Bug: a route file names an endpoint id that no descriptor declares. */
export class UnknownEndpointError extends Error {
  readonly code = "UNKNOWN_ENDPOINT";
  readonly endpointId: string;

  constructor(endpointId: string) {
    super(`UNKNOWN_ENDPOINT: ${endpointId}`);
    this.name = "UnknownEndpointError";
    this.endpointId = endpointId;
  }
}

const KNOWN_ENDPOINT_IDS: ReadonlySet<string> = new Set(CORE_ENDPOINTS.map((endpoint) => endpoint.id));

/**
 * Builds the web app's `route(endpointId)`: checks the id when the route module loads
 * (a typo fails `next build`), and resolves the handler lazily on the first request, so
 * building needs no runtime env. A declared endpoint without a handler yet answers the
 * canonical 500 envelope and logs `route_not_registered`.
 * @param endpointIds ids accepted besides the core descriptors (module endpoints).
 * @throws {UnknownEndpointError} at module load for an undeclared id.
 * @example export const GET = route("identity.getMe");
 */
export const createRouteResolver = (args: {
  getRoutes: () => CoreRoutes | Promise<CoreRoutes>;
  logger: Logger;
  endpointIds?: readonly string[];
}): ((endpointId: string) => RouteHandler) => {
  const known = new Set([...KNOWN_ENDPOINT_IDS, ...(args.endpointIds ?? [])]);
  return (endpointId) => {
    if (!known.has(endpointId)) throw new UnknownEndpointError(endpointId);
    return async (request) => {
      const handler = (await args.getRoutes())[endpointId];
      if (handler !== undefined) return handler(request);
      const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
      args.logger.error("route_not_registered", { requestId, endpointId });
      return errorResponse({ status: 500, code: "INTERNAL_ERROR", message: "Internal error.", requestId });
    };
  };
};
