import { describe, expect, it } from "vitest";
import { createLogger, type LogRecord } from "../../../shared/observability/logger.ts";
import { makeHealthRouteHandler } from "./health-route-handler.ts";

const VALID_ULID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";

const makeHandler = () => {
  const records: LogRecord[] = [];
  const logger = createLogger({
    context: { service: "web", env: "local" },
    sink: (record) => records.push(record),
  });
  return { GET: makeHealthRouteHandler({ logger }), records };
};

const healthRequest = () => new Request("http://localhost/v1/health", { headers: { "x-request-id": VALID_ULID } });

describe("GET /v1/health", () => {
  it("returns 200 with status ok and echoes the request id", async () => {
    const { GET } = makeHandler();

    const response = await GET(healthRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "ok" } });
    expect(response.headers.get("x-request-id")).toBe(VALID_ULID);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("logs one structured health_checked_ok line with request id and duration", async () => {
    const { GET, records } = makeHandler();

    await GET(healthRequest());

    expect(records).toEqual([
      expect.objectContaining({
        level: "info",
        message: "health_checked_ok",
        service: "web",
        env: "local",
        requestId: VALID_ULID,
        durationMs: expect.any(Number) as number,
      }),
    ]);
  });
});
