import {
  applyCorsHeaders,
  type CorsPolicy,
  isCorsPreflight,
  preflightResponse,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@core/services";
import { NextRequest, NextResponse } from "next/server";
import { API_CONTENT_SECURITY_POLICY } from "@/config/security-headers";

/** `nonce`: a fresh nonce per page request (decision 0016 §1); `static`: the fallback of §2. */
export type CspMode = "nonce" | "static";

export type ProxyDeps = {
  readonly corsPolicy: CorsPolicy;
  /** next-intl's middleware over `src/i18n/routing.ts`: locale redirects and the cookie. */
  readonly localeMiddleware: (request: NextRequest) => NextResponse;
  /** Page CSP for a nonce (`undefined` = static policy). */
  readonly pageCsp: (nonce: string | undefined) => string;
  readonly cspMode: CspMode;
};

const CSP_HEADER = "content-security-policy";
const NONCE_HEADER = "x-nonce";
/** Requested path + search, for the session guards' sign-in `?next=` (layouts get no pathname). */
export const REQUEST_PATH_HEADER = "x-request-path";

const isPublicApiPath = (pathname: string) => pathname === "/v1" || pathname.startsWith("/v1/");

// 16 random bytes, base64: unguessable and valid in a CSP source expression.
const createNonce = (): string => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

const handleApi = (deps: ProxyDeps, request: NextRequest, requestId: string): NextResponse => {
  if (isCorsPreflight(request)) {
    const preflight = preflightResponse(deps.corsPolicy, request);
    preflight.headers.set(REQUEST_ID_HEADER, requestId);
    return new NextResponse(null, { status: preflight.status, headers: preflight.headers });
  }
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set(CSP_HEADER, API_CONTENT_SECURITY_POLICY);
  applyCorsHeaders(deps.corsPolicy, request.headers.get("origin"), response.headers);
  return response;
};

// Next reads the nonce from the request's CSP header while rendering (Next CSP guide); the
// locale middleware copies the request headers it receives into its `next`/`rewrite` response.
const handlePage = (deps: ProxyDeps, request: NextRequest, requestId: string): NextResponse => {
  const nonce = deps.cspMode === "nonce" ? createNonce() : undefined;
  const policy = deps.pageCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(CSP_HEADER, policy);
  headers.set(REQUEST_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  if (nonce !== undefined) headers.set(NONCE_HEADER, nonce);
  const response = deps.localeMiddleware(new NextRequest(request, { headers }));
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set(CSP_HEADER, policy);
  return response;
};

/**
 * Edge of every request (rules/observability.md): keeps a valid incoming `x-request-id` ULID or
 * assigns a new one, forwards it to the handler and echoes it on the response. `/v1` gets the
 * CORS allowlist (preflights answered here, app/docs/decisions/0003) and the JSON CSP; page
 * routes go through the locale middleware (decision 0013 §3) with the page CSP (decision 0016).
 * No I/O, no auth.
 */
export const createProxy =
  (deps: ProxyDeps) =>
  (request: NextRequest): NextResponse => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    return isPublicApiPath(request.nextUrl.pathname)
      ? handleApi(deps, request, requestId)
      : handlePage(deps, request, requestId);
  };
