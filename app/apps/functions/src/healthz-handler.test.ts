import { createLogger, type LogRecord } from "@core/services";
import { describe, expect, it } from "vitest";
import { makeHealthzHandler } from "./healthz-handler.ts";

const VALID_ULID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";

const makeHandler = () => {
  const records: LogRecord[] = [];
  const logger = createLogger({ context: { service: "functions", env: "local" }, sink: (record) => records.push(record) });
  return { healthz: makeHealthzHandler({ logger }), records };
};

const healthzRequest = (method: string) =>
  new Request("http://127.0.0.1:5001/demo-core/southamerica-east1/healthz", {
    method,
    headers: { "x-request-id": VALID_ULID },
  });

describe("healthz", () => {
  it("answers GET with 200 and status ok", async () => {
    const { healthz } = makeHandler();

    const response = await healthz(healthzRequest("GET"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "ok" } });
    expect(response.headers.get("x-request-id")).toBe(VALID_ULID);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])("rejects %s with 405 and the error envelope", async (method) => {
    const { healthz } = makeHandler();

    const response = await healthz(healthzRequest(method));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed.", requestId: VALID_ULID },
    });
  });

  it("logs one line per call, including rejected methods", async () => {
    const { healthz, records } = makeHandler();

    await healthz(healthzRequest("GET"));
    await healthz(healthzRequest("POST"));

    expect(records).toEqual([
      expect.objectContaining({ message: "health_checked_ok", status: 200, requestId: VALID_ULID }),
      expect.objectContaining({ message: "health_method_rejected_ok", status: 405, requestId: VALID_ULID }),
    ]);
  });
});
