import { createLogger, type LogRecord } from "@core/services";
import { describe, expect, it } from "vitest";
import { type NodeRequestLike, type NodeResponseLike, serveWebHandler, toWebRequest } from "./express-web-bridge.ts";

const CLIENT_REQUEST_ID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";

const makeNodeRequest = (overrides: Partial<NodeRequestLike> = {}): NodeRequestLike => ({
  method: "GET",
  protocol: "http",
  originalUrl: "/demo-core/southamerica-east1/healthz?probe=1",
  headers: {
    host: "127.0.0.1:5001",
    "x-request-id": CLIENT_REQUEST_ID,
    "x-forwarded-for": "203.0.113.7",
    "x-trace-hop": ["a", "b"],
  },
  ...overrides,
});

const makeNodeResponse = () => {
  // Starts with the header Express sets before any handler runs.
  const sent: { status?: number; headers: Record<string, string | string[]>; body?: Buffer } = {
    headers: { "x-powered-by": "Express" },
  };
  const response: NodeResponseLike = {
    status(code) {
      sent.status = code;
      return response;
    },
    setHeader(name, value) {
      sent.headers[name] = value;
    },
    removeHeader(name) {
      delete sent.headers[name];
    },
    end(body) {
      sent.body = body;
    },
  };
  return { response, sent };
};

const makeServe = (handler: (request: Request) => Promise<Response>) => {
  const records: LogRecord[] = [];
  const logger = createLogger({
    context: { service: "functions", env: "local" },
    sink: (record) => records.push(record),
  });
  return { serve: serveWebHandler({ operation: "healthz", logger }, handler), records };
};

describe("toWebRequest", () => {
  it("rebuilds URL, method and headers of the incoming request", () => {
    const request = toWebRequest(makeNodeRequest());

    expect(request.url).toBe("http://127.0.0.1:5001/demo-core/southamerica-east1/healthz?probe=1");
    expect(request.method).toBe("GET");
    expect(request.headers.get("x-request-id")).toBe(CLIENT_REQUEST_ID);
    expect(request.headers.get("x-trace-hop")).toBe("a, b");
  });

  it("carries the raw body of a request that has one", async () => {
    const request = toWebRequest(makeNodeRequest({ method: "POST", rawBody: Buffer.from('{"a":1}') }));

    expect(await request.text()).toBe('{"a":1}');
  });
});

describe("serveWebHandler", () => {
  it("copies status, headers and body of the web response", async () => {
    const { response, sent } = makeNodeResponse();
    const { serve } = makeServe(() =>
      Promise.resolve(
        Response.json({ data: { status: "ok" } }, { status: 201, headers: { "cache-control": "no-store" } }),
      ),
    );

    await serve(makeNodeRequest(), response);

    expect(sent.status).toBe(201);
    expect(sent.headers).toMatchObject({ "cache-control": "no-store", "content-type": "application/json" });
    expect(sent.body?.toString("utf8")).toBe('{"data":{"status":"ok"}}');
  });

  it("drops x-powered-by and adds nosniff", async () => {
    const { response, sent } = makeNodeResponse();
    const { serve } = makeServe(() => Promise.resolve(new Response("ok")));

    await serve(makeNodeRequest(), response);

    expect(sent.headers).not.toHaveProperty("x-powered-by");
    expect(sent.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("keeps each Set-Cookie as its own header value", async () => {
    const { response, sent } = makeNodeResponse();
    const headers = new Headers();
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    const { serve } = makeServe(() => Promise.resolve(new Response(null, { status: 204, headers })));

    await serve(makeNodeRequest(), response);

    expect(sent.headers["set-cookie"]).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("turns a handler failure into one log line and the 500 envelope", async () => {
    const { response, sent } = makeNodeResponse();
    const { serve, records } = makeServe(() => Promise.reject(new Error("boom: secret detail")));

    await serve(makeNodeRequest(), response);

    expect(sent.status).toBe(500);
    expect(sent.headers["x-request-id"]).toBe(CLIENT_REQUEST_ID);
    expect(JSON.parse(sent.body?.toString("utf8") ?? "")).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId: CLIENT_REQUEST_ID },
    });
    expect(sent.body?.toString("utf8")).not.toContain("secret detail");
    expect(records).toEqual([
      expect.objectContaining({ level: "error", message: "healthz_failed", requestId: CLIENT_REQUEST_ID }),
    ]);
  });

  it("returns the 500 envelope when the request cannot be converted", async () => {
    const { response, sent } = makeNodeResponse();
    const { serve, records } = makeServe(() => Promise.resolve(new Response("unreachable")));

    await serve(makeNodeRequest({ originalUrl: "//[bad" }), response);

    expect(sent.status).toBe(500);
    expect(records).toHaveLength(1);
    expect(records[0]?.message).toBe("healthz_failed");
  });
});
