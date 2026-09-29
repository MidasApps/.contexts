import { describe, expect, it } from "vitest";
import { type NodeRequestLike, type NodeResponseLike, serveWebHandler, toWebRequest } from "./express-web-bridge.ts";

const makeNodeRequest = (overrides: Partial<NodeRequestLike> = {}): NodeRequestLike => ({
  method: "GET",
  protocol: "http",
  originalUrl: "/demo-core/southamerica-east1/healthz?probe=1",
  headers: { host: "127.0.0.1:5001", "x-request-id": "01K6BZ3YQ8X4M7N2P5R9T0V1W2", "x-forwarded-for": "203.0.113.7", "x-trace-hop": ["a", "b"] },
  ...overrides,
});

const makeNodeResponse = () => {
  const sent: { status?: number; headers: Record<string, string>; body?: Buffer } = { headers: {} };
  const response: NodeResponseLike = {
    status(code) {
      sent.status = code;
      return response;
    },
    setHeader(name, value) {
      sent.headers[name] = value;
    },
    send(body) {
      sent.body = body;
    },
  };
  return { response, sent };
};

describe("toWebRequest", () => {
  it("rebuilds URL, method and headers of the incoming request", () => {
    const request = toWebRequest(makeNodeRequest());

    expect(request.url).toBe("http://127.0.0.1:5001/demo-core/southamerica-east1/healthz?probe=1");
    expect(request.method).toBe("GET");
    expect(request.headers.get("x-request-id")).toBe("01K6BZ3YQ8X4M7N2P5R9T0V1W2");
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
    const handler = serveWebHandler(() =>
      Promise.resolve(Response.json({ data: { status: "ok" } }, { status: 201, headers: { "cache-control": "no-store" } })),
    );

    await handler(makeNodeRequest(), response);

    expect(sent.status).toBe(201);
    expect(sent.headers).toMatchObject({ "cache-control": "no-store", "content-type": "application/json" });
    expect(sent.body?.toString("utf8")).toBe('{"data":{"status":"ok"}}');
  });
});
