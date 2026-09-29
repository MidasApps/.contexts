import { describe, expect, it } from "vitest";
import { createLogger, type LogRecord } from "../observability/logger.ts";
import { withRouteBoundary } from "./route-boundary.ts";

const VALID_ULID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";

const makeLogger = () => {
  const records: LogRecord[] = [];
  const logger = createLogger({
    context: { service: "web", env: "local" },
    sink: (record) => records.push(record),
  });
  return { logger, records };
};

const requestWith = (requestId?: string) =>
  new Request("http://localhost/v1/things", requestId ? { headers: { "x-request-id": requestId } } : {});

describe("withRouteBoundary", () => {
  it("passes the resolved request id to the handler and echoes it on the response", async () => {
    const { logger, records } = makeLogger();
    const handler = withRouteBoundary({ operation: "thing_read", logger }, (_request, context) =>
      Promise.resolve(Response.json({ data: { requestId: context.requestId } })),
    );

    const response = await handler(requestWith(VALID_ULID));

    expect(response.headers.get("x-request-id")).toBe(VALID_ULID);
    expect(await response.json()).toEqual({ data: { requestId: VALID_ULID } });
    expect(records).toEqual([
      expect.objectContaining({
        level: "info",
        message: "thing_read_ok",
        requestId: VALID_ULID,
        status: 200,
        durationMs: expect.any(Number) as number,
      }),
    ]);
  });

  it("maps an unexpected throw to a 500 INTERNAL_ERROR envelope without leaking the cause", async () => {
    const { logger, records } = makeLogger();
    const handler = withRouteBoundary({ operation: "thing_read", logger }, () =>
      Promise.reject(new Error("SELECT * FROM secrets failed")),
    );

    const response = await handler(requestWith(VALID_ULID));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId: VALID_ULID },
    });
    expect(body).not.toContain("secrets");
    expect(response.headers.get("x-request-id")).toBe(VALID_ULID);
    expect(records).toEqual([
      expect.objectContaining({
        level: "error",
        message: "thing_read_failed",
        requestId: VALID_ULID,
        durationMs: expect.any(Number) as number,
        err: expect.objectContaining({ message: "SELECT * FROM secrets failed" }) as object,
      }),
    ]);
  });

  it("echoes the request id on a response whose headers are immutable", async () => {
    const { logger } = makeLogger();
    // Response.redirect (like a proxied fetch response) has an immutable header guard.
    const immutable = Response.redirect("http://localhost/elsewhere", 307);
    const handler = withRouteBoundary({ operation: "thing_read", logger }, () => Promise.resolve(immutable));

    const response = await handler(requestWith(VALID_ULID));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/elsewhere");
    expect(response.headers.get("x-request-id")).toBe(VALID_ULID);
  });

  it("generates a request id when the incoming one is missing", async () => {
    const { logger } = makeLogger();
    const handler = withRouteBoundary({ operation: "thing_read", logger }, () =>
      Promise.resolve(new Response(null, { status: 204 })),
    );

    const response = await handler(requestWith());

    expect(response.headers.get("x-request-id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
