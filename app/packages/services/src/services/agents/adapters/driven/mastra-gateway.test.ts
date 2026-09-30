import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentCallScope } from "../../application/ports/agent-runtime-gateway.ts";
import { gatewayErrorResponse } from "./mastra-error-mapper.ts";
import { createMastraGateway } from "./mastra-gateway.ts";

type Recorded = { method: string; url: string; headers: IncomingMessage["headers"]; body: unknown };
type Route = (request: IncomingMessage, response: ServerResponse) => void;

const recorded: Recorded[] = [];
const routes = new Map<string, Route>();
const closedRequests: string[] = [];
let server: Server;
let baseUrl = "";

const readBody = (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text === "" ? undefined : JSON.parse(text));
    });
  });

beforeAll(async () => {
  server = createServer((request, response) => {
    const key = `${request.method ?? ""} ${new URL(request.url ?? "/", "http://stub").pathname}`;
    request.on("close", () => closedRequests.push(key));
    void readBody(request).then((body) => {
      recorded.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers, body });
      const route = routes.get(key);
      if (route === undefined) {
        response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "no route in stub" }));
        return;
      }
      route(request, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  recorded.length = 0;
  closedRequests.length = 0;
  routes.clear();
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Route => (_request, response) => {
  response.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
};

const SCOPE: AgentCallScope = {
  bearer: "caller-id-token",
  tenantId: "Jd8sK2lPq0WnR5tYu3bV",
  projectId: "Pq8sK2lPq0WnR5tYu3bV",
  regional: { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Manaus", currency: "BRL" },
  activeScreen: "notes.list",
  conversationId: "Cv3sK2lPq0WnR5tYu3bV",
  requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
};

const gateway = (overrides: Partial<Parameters<typeof createMastraGateway>[0]> = {}) =>
  createMastraGateway({ baseUrl, serverlessToken: null, timeouts: { jsonMs: 2_000, streamConnectMs: 2_000 }, ...overrides });

const readText = async (stream: ReadableStream<Uint8Array>): Promise<string> => new Response(stream).text();

describe("createMastraGateway headers and body", () => {
  it("forwards the caller's Bearer and the /v1 scope, and runs with runId = requestId", async () => {
    routes.set("POST /api/agents/ping/generate", json(200, { text: "pong" }));
    const result = await gateway().generate({ scope: SCOPE, agentId: "ping", messages: "ping", options: { maxSteps: 2 } });
    expect(result).toEqual({ ok: true, data: { text: "pong" } });
    const [call] = recorded;
    expect(call?.headers).toMatchObject({
      authorization: "Bearer caller-id-token",
      "x-tenant-id": SCOPE.tenantId,
      "x-project-id": SCOPE.projectId,
      "x-locale": "pt-BR",
      "x-time-zone": "America/Sao_Paulo",
      "x-node-time-zone": "America/Manaus",
      "x-currency": "BRL",
      "x-active-screen": "notes.list",
      "x-conversation-id": SCOPE.conversationId,
      "x-request-id": SCOPE.requestId,
      traceparent: SCOPE.traceparent,
    });
    expect(call?.headers["x-serverless-authorization"]).toBeUndefined();
    expect(call?.body).toMatchObject({ runId: SCOPE.requestId, maxSteps: 2 });
  });

  it("strips a client requestContext and other server-owned keys from run options", async () => {
    routes.set("POST /api/agents/ping/generate", json(200, { text: "pong" }));
    routes.set("POST /api/agents/ping/stream", json(200, { ok: true }));
    const options = {
      requestContext: { tenantId: "Intruder000000000000" },
      runId: "client-run",
      resourceId: "other:uid",
      threadId: "t",
      tracingOptions: { metadata: { tenantId: "Intruder000000000000" } },
      maxSteps: 1,
    };
    await gateway().generate({ scope: SCOPE, agentId: "ping", messages: "ping", options });
    await gateway().stream({ scope: SCOPE, agentId: "ping", messages: [{ role: "user", content: "hi" }], options });
    for (const call of recorded) {
      expect(JSON.stringify(call.body)).not.toMatch(/Intruder|client-run|other:uid|"threadId"|tracingOptions/);
      expect(call.body).toMatchObject({ runId: SCOPE.requestId, maxSteps: 1 });
    }
  });

  it("adds X-Serverless-Authorization outside local", async () => {
    routes.set("POST /api/agents/ping/generate", json(200, { text: "pong" }));
    await gateway({ serverlessToken: { headerValue: () => Promise.resolve("Bearer google-signed") } }).generate({ scope: SCOPE, agentId: "ping", messages: "ping" });
    expect(recorded[0]?.headers["x-serverless-authorization"]).toBe("Bearer google-signed");
    expect(recorded[0]?.headers.authorization).toBe("Bearer caller-id-token");
  });

  it("answers UPSTREAM_UNAVAILABLE without calling Mastra when no ID token can be minted", async () => {
    const failing = { headerValue: () => Promise.reject(new Error("metadata server down")) };
    const result = await gateway({ serverlessToken: failing }).generate({ scope: SCOPE, agentId: "ping", messages: "ping" });
    expect(result).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
    expect(recorded).toEqual([]);
  });
});

describe("createMastraGateway error mapping", () => {
  it.each([
    [401, "UNAUTHORIZED", 401],
    [403, "FORBIDDEN", 403],
    [404, "NOT_FOUND", 404],
    [400, "VALIDATION_FAILED", 400],
    [500, "UPSTREAM_UNAVAILABLE", 502],
    [503, "UPSTREAM_UNAVAILABLE", 502],
  ])("maps Mastra %i to %s %i and never passes the body through", async (status, code, mapped) => {
    routes.set("POST /api/agents/ping/generate", json(status, { error: "internal stack at /srv/mastra.js" }));
    const result = await gateway().generate({ scope: SCOPE, agentId: "ping", messages: "ping" });
    expect(result).toEqual({ ok: false, error: { code, status: mapped } });
    if (result.ok) throw new Error("expected an error");
    const response = gatewayErrorResponse(result.error, SCOPE.requestId);
    const body = await response.text();
    expect(response.status).toBe(mapped);
    expect(body).not.toContain("internal stack");
    expect(JSON.parse(body)).toMatchObject({ error: { code, requestId: SCOPE.requestId } });
  });

  it("does not retry a failed generate", async () => {
    routes.set("POST /api/agents/ping/generate", json(500, { error: "boom" }));
    await gateway().generate({ scope: SCOPE, agentId: "ping", messages: "ping" });
    expect(recorded).toHaveLength(1);
  });

  it("maps a stream 429 to RATE_LIMITED with Retry-After", async () => {
    routes.set("POST /api/agents/ping/stream", json(429, { error: "slow down" }, { "retry-after": "7" }));
    const result = await gateway().stream({ scope: SCOPE, agentId: "ping", messages: "ping" });
    expect(result).toEqual({ ok: false, error: { code: "RATE_LIMITED", status: 429, retryAfterSeconds: 7 } });
    if (result.ok) throw new Error("expected an error");
    expect(gatewayErrorResponse(result.error, SCOPE.requestId).headers.get("retry-after")).toBe("7");
  });

  it("maps a deadline to UPSTREAM_UNAVAILABLE 504", async () => {
    routes.set("POST /api/agents/ping/generate", () => undefined); // never answers
    const result = await gateway({ timeouts: { jsonMs: 50 } }).generate({ scope: SCOPE, agentId: "ping", messages: "ping" });
    expect(result).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 504 } });
  });

  it("maps an unreachable Mastra to UPSTREAM_UNAVAILABLE 502", async () => {
    const result = await createMastraGateway({ baseUrl: "http://127.0.0.1:1", serverlessToken: null }).generate({ scope: SCOPE, agentId: "ping", messages: "ping" });
    expect(result).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
  });
});

describe("createMastraGateway streams", () => {
  it("passes the stream and its content type through", async () => {
    routes.set("POST /api/agents/ping/stream", (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"type":"text-delta","payload":{"text":"po"}}\n\n');
      response.end('data: {"type":"finish"}\n\n');
    });
    const result = await gateway().stream({ scope: SCOPE, agentId: "ping", messages: "ping" });
    if (!result.ok) throw new Error("expected a stream");
    expect(result.data.contentType).toBe("text/event-stream");
    expect(await readText(result.data.body)).toContain('"finish"');
    expect(result.data.conversationId).toBeUndefined();
  });

  it("returns the conversation Mastra created for a run that named none (follow-up #24)", async () => {
    routes.set("POST /api/agents/assistant/stream", (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream", "x-conversation-id": "Nw4sK2lPq0WnR5tYu3bV" }).end("data: {}\n\n");
    });
    const withoutConversation: AgentCallScope = { bearer: SCOPE.bearer, tenantId: SCOPE.tenantId, regional: SCOPE.regional, requestId: SCOPE.requestId };
    const result = await gateway().stream({ scope: withoutConversation, agentId: "assistant", messages: "hi" });
    if (!result.ok) throw new Error("expected a stream");
    expect(recorded[0]?.headers["x-conversation-id"]).toBeUndefined();
    expect(result.data.conversationId).toBe("Nw4sK2lPq0WnR5tYu3bV");
  });

  it("propagates the caller's abort to Mastra (the upstream request is closed)", async () => {
    routes.set("POST /api/agents/ping/stream", (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: {}\n\n"); // then keeps the stream open
    });
    const controller = new AbortController();
    const result = await gateway().stream({ scope: { ...SCOPE, signal: controller.signal }, agentId: "ping", messages: "ping" });
    if (!result.ok) throw new Error("expected a stream");
    const reader = result.data.body.getReader();
    await reader.read();
    controller.abort(new Error("client left"));
    await expect(reader.read()).rejects.toThrow();
    await expect.poll(() => closedRequests.includes("POST /api/agents/ping/stream")).toBe(true);
  });

  it("rejects with the caller's reason when aborted before Mastra answers", async () => {
    routes.set("POST /api/agents/ping/stream", () => undefined);
    const controller = new AbortController();
    const pending = gateway().stream({ scope: { ...SCOPE, signal: controller.signal }, agentId: "ping", messages: "ping" });
    await expect.poll(() => recorded.length).toBe(1);
    controller.abort(new Error("client left"));
    await expect(pending).rejects.toThrow("client left");
  });

  it("sends tool decisions and MCP messages to their routes", async () => {
    const sse: Route = (_request, response) => response.writeHead(200, { "content-type": "text/event-stream" }).end("data: {}\n\n");
    routes.set("POST /api/agents/ping/approve-tool-call", sse);
    routes.set("POST /api/agents/ping/decline-tool-call", sse);
    routes.set("POST /api/mcp/core/mcp", sse);
    const client = gateway();
    await client.approveToolCall({ scope: SCOPE, agentId: "ping", runId: SCOPE.requestId, toolCallId: "call-1" });
    await client.declineToolCall({ scope: SCOPE, agentId: "ping", runId: SCOPE.requestId, toolCallId: "call-2", reason: "not now" });
    await client.callMcp({ scope: SCOPE, serverId: "core", body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(recorded.map((call) => call.body)).toEqual([
      { runId: SCOPE.requestId, toolCallId: "call-1" },
      { runId: SCOPE.requestId, toolCallId: "call-2", reason: "not now" },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ]);
    expect(recorded[2]?.headers.accept).toBe("application/json, text/event-stream");
  });
});

describe("createMastraGateway JSON calls", () => {
  it("starts a workflow run and deletes a thread through the SDK", async () => {
    routes.set("POST /api/workflows/knowledge-ingest/create-run", json(200, { runId: "run-1" }));
    routes.set("POST /api/workflows/knowledge-ingest/start-async", json(200, { status: "success", result: { documents: 1 } }));
    routes.set("DELETE /api/memory/threads/Cv3sK2lPq0WnR5tYu3bV", json(200, { result: "Thread deleted" }));
    const client = gateway();
    const started = await client.startWorkflow({ scope: SCOPE, workflowId: "knowledge-ingest", inputData: { source: "url" } });
    expect(started).toMatchObject({ ok: true, data: { runId: "run-1", result: { status: "success" } } });
    expect(await client.deleteThread({ scope: SCOPE, agentId: "ping", threadId: SCOPE.conversationId ?? "" })).toEqual({ ok: true, data: null });
    for (const call of recorded) expect(call.headers.authorization).toBe("Bearer caller-id-token");
  });

  it("launches a workflow run without waiting for its result", async () => {
    routes.set("POST /api/workflows/knowledge-ingest/create-run", json(200, { runId: "run-2" }));
    routes.set("POST /api/workflows/knowledge-ingest/start", json(200, { message: "Workflow run started" }));
    const launched = await gateway().launchWorkflow({ scope: SCOPE, workflowId: "knowledge-ingest", inputData: { source: { kind: "url", url: "https://docs.example.com" } } });
    expect(launched).toEqual({ ok: true, data: { runId: "run-2" } });
    const start = recorded.find((call) => call.url.includes("/start"));
    expect(start?.url).toContain("runId=run-2");
    expect(start?.body).toMatchObject({ inputData: { source: { kind: "url" } } });
    expect(JSON.stringify(start?.body)).not.toContain("requestContext");
  });

  it("maps an upstream 403 of a launch", async () => {
    routes.set("POST /api/workflows/knowledge-ingest/create-run", json(403, { error: "forbidden" }));
    expect(await gateway().launchWorkflow({ scope: SCOPE, workflowId: "knowledge-ingest", inputData: {} })).toMatchObject({ ok: false, error: { code: "FORBIDDEN", status: 403 } });
  });
});
