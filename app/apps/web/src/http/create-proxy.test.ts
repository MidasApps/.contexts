import { createCorsPolicy } from "@core/services";
import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildPageContentSecurityPolicy } from "@/config/security-headers";
import { routing } from "@/i18n/routing";
import { createProxy, type CspMode } from "./create-proxy";

const VALID_ULID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const DESKTOP_ORIGIN = "http://localhost:1420";

const makeProxy = (cspMode: CspMode = "nonce") =>
  createProxy({
    corsPolicy: createCorsPolicy([DESKTOP_ORIGIN]),
    localeMiddleware: createMiddleware(routing),
    pageCsp: (nonce) => buildPageContentSecurityPolicy({ isDevelopment: false, nonce }),
    cspMode,
  });
const proxy = makeProxy();

const requestWith = (headers: Record<string, string> = {}, init: { path?: string; method?: string } = {}) =>
  new NextRequest(`http://localhost:3100${init.path ?? "/v1/health"}`, { headers, method: init.method ?? "GET" });

const preflightFrom = (origin: string, path = "/v1/health") =>
  requestWith({ origin, "access-control-request-method": "GET" }, { path, method: "OPTIONS" });

// NextResponse.next({ request: { headers } }) forwards the rewritten request
// headers to the handler through `x-middleware-request-<name>`.
const forwarded = (response: Response, name: string) => response.headers.get(`x-middleware-request-${name}`);

const nonceOf = (policy: string | null) => /'nonce-([^']+)'/.exec(policy ?? "")?.[1];

describe("createProxy request id", () => {
  it("keeps a valid incoming x-request-id on the request and the response", () => {
    const response = proxy(requestWith({ "x-request-id": VALID_ULID }));

    expect(forwarded(response, "x-request-id")).toBe(VALID_ULID);
    expect(response.headers.get("x-request-id")).toBe(VALID_ULID);
  });

  it("replaces an invalid incoming x-request-id with a new ULID", () => {
    const response = proxy(requestWith({ "x-request-id": "not-a-ulid" }));
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(ULID_PATTERN);
    expect(forwarded(response, "x-request-id")).toBe(requestId);
  });

  it("generates a ULID when the header is missing", () => {
    expect(proxy(requestWith()).headers.get("x-request-id")).toMatch(ULID_PATTERN);
  });

  it("puts a request id on page responses and locale redirects too", () => {
    const page = proxy(requestWith({ "x-request-id": VALID_ULID }, { path: "/pt-BR/sign-in" }));
    const redirect = proxy(requestWith({}, { path: "/" }));

    expect(page.headers.get("x-request-id")).toBe(VALID_ULID);
    expect(forwarded(page, "x-request-id")).toBe(VALID_ULID);
    expect(redirect.headers.get("x-request-id")).toMatch(ULID_PATTERN);
  });
});

describe("createProxy /v1", () => {
  it("answers a /v1 preflight from an allowed origin without reaching the route", () => {
    const response = proxy(preflightFrom(DESKTOP_ORIGIN));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(DESKTOP_ORIGIN);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("x-request-id")).toMatch(ULID_PATTERN);
  });

  it("answers a /v1 preflight from a disallowed origin with no allow-origin header", () => {
    const response = proxy(preflightFrom("http://evil.example"));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("adds CORS headers to an actual /v1 request from an allowed origin", () => {
    const response = proxy(requestWith({ origin: DESKTOP_ORIGIN }));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("access-control-allow-origin")).toBe(DESKTOP_ORIGIN);
    expect(response.headers.get("access-control-expose-headers")).toBe("x-request-id, x-conversation-id, retry-after");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("leaves /v1 untouched by the locale middleware and gives it the JSON CSP", () => {
    const response = proxy(requestWith({ "accept-language": "en-US", cookie: "NEXT_LOCALE=es-419" }, { path: "/v1/me" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("leaves page routes without CORS", () => {
    const response = proxy(requestWith({ origin: DESKTOP_ORIGIN }, { path: "/pt-BR/sign-in" }));
    const preflight = proxy(preflightFrom(DESKTOP_ORIGIN, "/pt-BR/sign-in"));

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("createProxy locale", () => {
  it("redirects / to the default locale", () => {
    const response = proxy(requestWith({}, { path: "/" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3100/pt-BR");
  });

  it("prefers the NEXT_LOCALE cookie over Accept-Language", () => {
    const response = proxy(requestWith({ cookie: "NEXT_LOCALE=es-419", "accept-language": "en-US,en;q=0.9" }, { path: "/sign-in" }));

    expect(response.headers.get("location")).toBe("http://localhost:3100/es-419/sign-in");
  });

  it("uses Accept-Language when there is no cookie", () => {
    const response = proxy(requestWith({ "accept-language": "en-US,en;q=0.9" }, { path: "/organizations" }));

    expect(response.headers.get("location")).toBe("http://localhost:3100/en-US/organizations");
  });

  it("serves a path that already carries a supported locale", () => {
    const response = proxy(requestWith({}, { path: "/en-US/profile/account" }));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("createProxy request path", () => {
  it("forwards the requested path and search to the render (the session guard builds sign-in ?next= from it)", () => {
    const response = proxy(requestWith({}, { path: "/pt-BR/o/a/p/b?unit=c" }));

    expect(forwarded(response, "x-request-path")).toBe("/pt-BR/o/a/p/b?unit=c");
  });
});

describe("createProxy page CSP", () => {
  it("sends a nonce CSP on the response and forwards it with x-nonce to the render", () => {
    const response = proxy(requestWith({}, { path: "/pt-BR/sign-in" }));
    const policy = response.headers.get("content-security-policy");
    const nonce = nonceOf(policy);

    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{16,}$/);
    expect(forwarded(response, "content-security-policy")).toBe(policy);
    expect(forwarded(response, "x-nonce")).toBe(nonce);
  });

  it("uses a different nonce on every request", () => {
    const first = nonceOf(proxy(requestWith({}, { path: "/pt-BR/sign-in" })).headers.get("content-security-policy"));
    const second = nonceOf(proxy(requestWith({}, { path: "/pt-BR/sign-in" })).headers.get("content-security-policy"));

    expect(first).not.toBe(second);
  });

  it("sends the static fallback policy without a nonce in static mode", () => {
    const response = makeProxy("static")(requestWith({}, { path: "/pt-BR/sign-in" }));

    expect(response.headers.get("content-security-policy")).toBe(buildPageContentSecurityPolicy({ isDevelopment: false }));
    expect(forwarded(response, "x-nonce")).toBeNull();
  });
});
