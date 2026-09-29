import { REQUEST_ID_HEADER, resolveRequestId } from "@core/services";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Edge of every request (rules/observability.md): keeps a valid incoming
 * `x-request-id` ULID or assigns a new one, forwards it to the handler and
 * echoes it on the response. Kept trivial: no I/O, no auth.
 */
export const proxy = (request: NextRequest): NextResponse => {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
};

// Static assets carry no request context worth correlating.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
