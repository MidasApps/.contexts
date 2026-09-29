import { createCorsPolicy } from "@core/services";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createProxy } from "./create-proxy";

const VALID_ULID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const DESKTOP_ORIGIN = "http://localhost:1420";
const proxy = createProxy({ corsPolicy: createCorsPolicy([DESKTOP_ORIGIN]) });

const requestWith = (headers: Record<string, string> = {}, init: { path?: string; method?: string } = {}) =>
  new NextRequest(`http://localhost:3000${init.path ?? "/v1/health"}`, { headers, method: init.method ?? "GET" });

const preflightFrom = (origin: string, path = "/v1/health") =>
  requestWith({ origin, "access-control-request-method": "GET" }, { path, method: "OPTIONS" });

// NextResponse.next({ request: { headers } }) forwards the rewritten request
// headers to the handler through `x-middleware-request-<name>`.
const forwardedRequestId = (response: Response) => response.headers.get("x-middleware-request-x-request-id");

describe("createProxy", () => {
  it("keeps a valid incoming x-request-id on the request and the response", () => {
    const response = proxy(requestWith({ "x-request-id": VALID_ULID }));

    expect(forwardedRequestId(response)).toBe(VALID_ULID);
    expect(response.headers.get("x-request-id")).toBe(VALID_ULID);
  });

  it("replaces an invalid incoming x-request-id with a new ULID", () => {
    const response = proxy(requestWith({ "x-request-id": "not-a-ulid" }));
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(ULID_PATTERN);
    expect(forwardedRequestId(response)).toBe(requestId);
  });

  it("generates a ULID when the header is missing", () => {
    const response = proxy(requestWith());

    expect(response.headers.get("x-request-id")).toMatch(ULID_PATTERN);
  });

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
    expect(response.headers.get("access-control-expose-headers")).toBe("x-request-id");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("leaves routes outside /v1 without CORS", () => {
    const response = proxy(requestWith({ origin: DESKTOP_ORIGIN }, { path: "/" }));
    const preflight = proxy(preflightFrom(DESKTOP_ORIGIN, "/"));

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    expect(preflight.headers.get("x-middleware-next")).toBe("1");
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });
});
