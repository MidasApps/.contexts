import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const VALID_ULID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const requestWith = (headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/v1/health", { headers });

// NextResponse.next({ request: { headers } }) forwards the rewritten request
// headers to the handler through `x-middleware-request-<name>`.
const forwardedRequestId = (response: Response) => response.headers.get("x-middleware-request-x-request-id");

describe("proxy", () => {
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
});
