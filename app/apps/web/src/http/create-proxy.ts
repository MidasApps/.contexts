import {
  applyCorsHeaders,
  type CorsPolicy,
  isCorsPreflight,
  preflightResponse,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@core/services";
import { type NextRequest, NextResponse } from "next/server";

const isPublicApiPath = (pathname: string) => pathname === "/v1" || pathname.startsWith("/v1/");

/**
 * Edge of every request (rules/observability.md): keeps a valid incoming
 * `x-request-id` ULID or assigns a new one, forwards it to the handler and
 * echoes it on the response. On `/v1` it also applies the CORS allowlist and
 * answers preflights itself (app/docs/decisions/0003). No I/O, no auth.
 */
export const createProxy =
  (deps: { corsPolicy: CorsPolicy }) =>
  (request: NextRequest): NextResponse => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const isApi = isPublicApiPath(request.nextUrl.pathname);
    if (isApi && isCorsPreflight(request)) {
      const preflight = preflightResponse(deps.corsPolicy, request);
      preflight.headers.set(REQUEST_ID_HEADER, requestId);
      return new NextResponse(null, { status: preflight.status, headers: preflight.headers });
    }
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    if (isApi) applyCorsHeaders(deps.corsPolicy, request.headers.get("origin"), response.headers);
    return response;
  };
