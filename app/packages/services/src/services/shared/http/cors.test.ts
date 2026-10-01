import { describe, expect, it } from "vitest";
import { applyCorsHeaders, CorsOriginListSchema, createCorsPolicy, isCorsPreflight, preflightResponse } from "./cors.ts";

const DESKTOP_DEV = "http://localhost:1420";
const TAURI_WINDOWS = "http://tauri.localhost";
const policy = createCorsPolicy([DESKTOP_DEV, "tauri://localhost", TAURI_WINDOWS]);

const preflight = (origin: string | null, requestHeaders = "authorization, content-type") =>
  new Request("http://localhost:3000/v1/health", {
    method: "OPTIONS",
    headers: {
      ...(origin === null ? {} : { origin }),
      "access-control-request-method": "GET",
      "access-control-request-headers": requestHeaders,
    },
  });

describe("CorsOriginListSchema", () => {
  it("splits a comma-separated list of origins and trims blanks", () => {
    const result = CorsOriginListSchema.parse(" http://localhost:1420 , tauri://localhost,,http://tauri.localhost ");

    expect(result).toEqual([DESKTOP_DEV, "tauri://localhost", TAURI_WINDOWS]);
  });

  it.each([
    ["a wildcard", "*"],
    ["a wildcard among origins", `${DESKTOP_DEV},*`],
    ["a path", "http://localhost:1420/app"],
    ["a trailing slash", "http://localhost:1420/"],
    ["a query", "http://localhost:1420?x=1"],
    ["credentials", "http://user:pass@localhost:1420"],
    ["a bare host", "localhost:1420"],
  ])("rejects %s", (_label, value) => {
    expect(CorsOriginListSchema.safeParse(value).success).toBe(false);
  });

  it("normalizes origins to lower case, as browsers send them in Origin", () => {
    expect(CorsOriginListSchema.parse("HTTP://LocalHost:1420,Tauri://LOCALHOST")).toEqual([DESKTOP_DEV, "tauri://localhost"]);
  });

  it("accepts an empty list (CORS disabled)", () => {
    expect(CorsOriginListSchema.parse("")).toEqual([]);
  });
});

describe("isCorsPreflight", () => {
  it("is true for OPTIONS with Origin and Access-Control-Request-Method", () => {
    expect(isCorsPreflight(preflight(DESKTOP_DEV))).toBe(true);
  });

  it("is false for a plain OPTIONS without the preflight headers", () => {
    expect(isCorsPreflight(new Request("http://localhost:3000/v1/health", { method: "OPTIONS" }))).toBe(false);
  });

  it("is false for a GET", () => {
    expect(isCorsPreflight(new Request("http://localhost:3000/v1/health", { headers: { origin: DESKTOP_DEV } }))).toBe(false);
  });
});

describe("preflightResponse", () => {
  it("answers an allowed origin with 204 and the allowed methods and headers, without credentials", () => {
    const response = preflightResponse(policy, preflight(TAURI_WINDOWS));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(TAURI_WINDOWS);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, PUT, PATCH, DELETE");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type, idempotency-key, x-request-id",
    );
    expect(response.headers.get("access-control-max-age")).toBe("600");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  });

  it("answers a disallowed origin with 204 and no access-control-allow-* headers", () => {
    const response = preflightResponse(policy, preflight("http://evil.example"));

    expect(response.status).toBe(204);
    expect([...response.headers.keys()].filter((key) => key.startsWith("access-control-"))).toEqual([]);
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("never echoes a wildcard or the literal null origin", () => {
    expect(preflightResponse(policy, preflight("null")).headers.get("access-control-allow-origin")).toBeNull();
    expect(preflightResponse(createCorsPolicy([]), preflight(DESKTOP_DEV)).headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("applyCorsHeaders", () => {
  it("echoes an allowed origin, exposes the headers clients read and varies on Origin", () => {
    const headers = new Headers();

    applyCorsHeaders(policy, DESKTOP_DEV, headers);

    expect(headers.get("access-control-allow-origin")).toBe(DESKTOP_DEV);
    // The desktop reads the id of a new conversation and the wait of a 429 across origins.
    expect(headers.get("access-control-expose-headers")).toBe("x-request-id, x-conversation-id, retry-after");
    expect(headers.get("access-control-allow-credentials")).toBeNull();
    expect(headers.get("vary")).toBe("Origin");
  });

  it("adds only Vary for a disallowed or missing origin", () => {
    const disallowed = new Headers();
    const missing = new Headers();

    applyCorsHeaders(policy, "http://evil.example", disallowed);
    applyCorsHeaders(policy, null, missing);

    expect([...disallowed.keys()]).toEqual(["vary"]);
    expect([...missing.keys()]).toEqual(["vary"]);
  });

  it("appends Origin to an existing Vary header", () => {
    const headers = new Headers({ vary: "Accept-Encoding" });

    applyCorsHeaders(policy, DESKTOP_DEV, headers);

    expect(headers.get("vary")).toBe("Accept-Encoding, Origin");
  });
});
