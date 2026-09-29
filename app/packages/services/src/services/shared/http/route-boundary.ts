import type { RequestId } from "@core/contracts";
import type { Logger } from "../observability/logger.ts";
import { REQUEST_ID_HEADER, resolveRequestId } from "../observability/request-id.ts";
import { errorResponse } from "./error-envelope.ts";

export type RouteContext = { requestId: RequestId };

export type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Sets `x-request-id`, copying the response when its headers are immutable
 * (`Response.redirect`, a proxied `fetch` response): `set` throws a TypeError there.
 */
const withRequestIdHeader = (response: Response, requestId: RequestId): Response => {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch (err: unknown) {
    if (!(err instanceof TypeError)) throw err;
    const headers = new Headers(response.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};

/**
 * Top-level boundary of every HTTP driving adapter (rules/error-handling.md):
 * resolves the request id, times the call, logs exactly once and turns any
 * unexpected throw into a generic 500 `INTERNAL_ERROR`. Expected domain
 * errors are mapped by the handler itself and never reach the catch.
 * @param options.operation snake_case name; logs `<operation>_ok|_failed`.
 */
export const withRouteBoundary =
  (
    options: { operation: string; logger: Logger },
    handler: (request: Request, context: RouteContext) => Promise<Response>,
  ): RouteHandler =>
  async (request) => {
    const { operation, logger } = options;
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const startedAt = performance.now();
    const elapsedMs = () => Math.round(performance.now() - startedAt);
    try {
      const response = withRequestIdHeader(await handler(request, { requestId }), requestId);
      logger.info(`${operation}_ok`, { requestId, status: response.status, durationMs: elapsedMs() });
      return response;
    } catch (err: unknown) {
      logger.error(`${operation}_failed`, { requestId, durationMs: elapsedMs(), err });
      return errorResponse({ status: 500, code: "INTERNAL_ERROR", message: "Internal error.", requestId });
    }
  };
