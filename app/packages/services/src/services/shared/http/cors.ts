import { z } from "zod";
import { REQUEST_ID_HEADER } from "../observability/request-id.ts";

/**
 * CORS for `/v1` (app/docs/decisions/0003): an explicit origin allowlist, never
 * `*`, never credentials. `/v1` authenticates with `Authorization: Bearer` only
 * (spec §16.2), so cookies must never ride along cross-origin.
 */

// scheme://host[:port] and nothing else: no path, query, fragment or userinfo.
// Custom schemes are allowed on purpose (`tauri://localhost` is the Tauri
// webview origin on macOS/Linux).
const ORIGIN_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s/?#@]+$/;

const OriginSchema = z
  .string()
  .regex(ORIGIN_PATTERN, { error: "expected scheme://host[:port]" })
  .refine((origin) => URL.canParse(origin), { error: "expected a parsable origin" });

/**
 * Comma-separated origins from env; blanks are dropped, `*` is rejected.
 * Entries are lower-cased: browsers serialize the `Origin` header with a
 * lower-case scheme and host, so a mixed-case entry would never match.
 */
export const CorsOriginListSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(OriginSchema));

export type CorsPolicy = { readonly allowedOrigins: ReadonlySet<string> };

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE";
const ALLOWED_HEADERS = `authorization, content-type, idempotency-key, ${REQUEST_ID_HEADER}`;
/** 10 min: browsers cap it anyway (Chromium at 2 h); short keeps allowlist edits effective. */
const PREFLIGHT_MAX_AGE_SECONDS = "600";
const PREFLIGHT_VARY = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"];

export const createCorsPolicy = (allowedOrigins: readonly string[]): CorsPolicy => ({
  allowedOrigins: new Set(allowedOrigins),
});

const isAllowedOrigin = (policy: CorsPolicy, origin: string | null): origin is string =>
  origin !== null && policy.allowedOrigins.has(origin);

const appendVary = (headers: Headers, values: readonly string[]) => {
  const current = headers.get("vary");
  const merged = [...(current ? current.split(",").map((value) => value.trim()) : []), ...values];
  headers.set("vary", [...new Set(merged)].join(", "));
};

/** A CORS preflight: OPTIONS carrying `Origin` and `Access-Control-Request-Method`. */
export const isCorsPreflight = (request: Request): boolean =>
  request.method === "OPTIONS" &&
  request.headers.has("origin") &&
  request.headers.has("access-control-request-method");

/**
 * Answers a preflight without reaching a route. A disallowed origin gets the
 * same 204 minus every `access-control-allow-*` header, so the browser blocks it.
 */
export const preflightResponse = (policy: CorsPolicy, request: Request): Response => {
  const headers = new Headers();
  appendVary(headers, PREFLIGHT_VARY);
  const origin = request.headers.get("origin");
  if (isAllowedOrigin(policy, origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", ALLOWED_METHODS);
    headers.set("access-control-allow-headers", ALLOWED_HEADERS);
    headers.set("access-control-max-age", PREFLIGHT_MAX_AGE_SECONDS);
  }
  return new Response(null, { status: 204, headers });
};

/**
 * Adds CORS headers for an actual (non-preflight) request, in place. `Vary:
 * Origin` is always set so a shared cache never serves one origin's answer to another.
 */
export const applyCorsHeaders = (policy: CorsPolicy, origin: string | null, headers: Headers): void => {
  appendVary(headers, ["Origin"]);
  if (!isAllowedOrigin(policy, origin)) return;
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-expose-headers", REQUEST_ID_HEADER);
};
