import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "../../application/ports/agent-runtime-gateway.ts";
import { createMastraChatGateway, memoryAgentIdOf } from "./mastra-chat-gateway.ts";

const SCOPE: AgentCallScope = {
  bearer: "user-token",
  tenantId: "org-1",
  regional: { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" },
  requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  conversationId: "conv-1",
};

type Seen = { url: string; method: string; headers: Headers; body: string | null };

/** A gateway over a scripted `fetch` that records each request. */
const gatewayWith = (answer: (seen: Seen) => Response) => {
  const seen: Seen[] = [];
  const fetchStub = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = { url: input instanceof Request ? input.url : input.toString(), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : null };
    seen.push(request);
    return Promise.resolve(answer(request));
  };
  return { gateway: createMastraChatGateway({ baseUrl: "http://mastra.local/", serverlessToken: null, fetch: fetchStub }), seen };
};

describe("Mastra chat gateway", () => {
  it("posts the turn outside the API prefix with the forwarded scope and returns the stream and run id", async () => {
    const { gateway, seen } = gatewayWith(
      () => new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream", "x-run-id": "run-7", "x-vercel-ai-ui-message-stream": "v1" } }),
    );
    const sent = await gateway.send({ scope: SCOPE, agentId: "assistant", body: { messages: [{ id: "m1", role: "user", parts: [] }] } });
    expect(sent.ok && sent.data.runId).toBe("run-7");
    expect(sent.ok && (await new Response(sent.data.body).text())).toBe("data: [DONE]\n\n");
    expect(seen[0]).toMatchObject({ url: "http://mastra.local/chat/assistant", method: "POST" });
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer user-token");
    expect(seen[0]?.headers.get("x-conversation-id")).toBe("conv-1");
    expect(JSON.parse(seen[0]?.body ?? "{}")).toEqual({ messages: [{ id: "m1", role: "user", parts: [] }] });
  });

  it("reads 204 from observe as nothing to replay, and maps error statuses without the body", async () => {
    const { gateway } = gatewayWith((seen) =>
      seen.url.endsWith("/observe") ? new Response(null, { status: 204 }) : Response.json({ error: "secret upstream detail" }, { status: 403 }),
    );
    expect(await gateway.observe({ scope: SCOPE, agentId: "assistant", runId: "run-1" })).toEqual({ ok: true, data: null });
    expect(await gateway.abort({ scope: SCOPE, runId: "run-1" })).toEqual({ ok: false, error: { code: "FORBIDDEN", status: 403 } });
  });

  it("parses the messages and summary answers and refuses a malformed one", async () => {
    const { gateway, seen } = gatewayWith((request) =>
      request.url.includes("/messages")
        ? Response.json({ data: [{ id: "m1", role: "user", parts: [] }], meta: { hasMore: true } })
        : Response.json({ unexpected: true }),
    );
    expect(await gateway.listMessages({ scope: SCOPE, agentId: "assistant", page: 1, perPage: 20 })).toEqual({
      ok: true,
      data: { messages: [{ id: "m1", role: "user", parts: [] }], hasMore: true },
    });
    expect(seen[0]?.url).toBe("http://mastra.local/chat/assistant/messages?page=1&perPage=20");
    expect(await gateway.summarize({ scope: SCOPE, agentId: "assistant" })).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
  });

  it("passes a core error code of Mastra's envelope, so the kill-switch reaches /v1 as FEATURE_DISABLED", async () => {
    const { gateway } = gatewayWith(() => Response.json({ error: { code: "FEATURE_DISABLED", message: "This feature is turned off.", requestId: "r" } }, { status: 503 }));
    const sent = await gateway.send({ scope: SCOPE, agentId: "assistant", body: { messages: [{ id: "m1", role: "user", parts: [] }] } });
    expect(sent).toEqual({ ok: false, error: { code: "FEATURE_DISABLED", status: 503 } });
  });

  it("falls back to the status for an unknown code, a non-JSON body and an upstream INTERNAL_ERROR", async () => {
    const answers = [
      Response.json({ error: { code: "SOMETHING_ELSE" } }, { status: 503 }),
      new Response("<html>bad gateway</html>", { status: 503, headers: { "content-type": "text/html" } }),
      Response.json({ error: { code: "INTERNAL_ERROR", message: "Internal error." } }, { status: 500 }),
    ];
    const { gateway } = gatewayWith(() => answers.shift() ?? new Response(null, { status: 500 }));
    for (let index = 0; index < 3; index += 1) {
      expect(await gateway.abort({ scope: SCOPE, runId: "run-1" })).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
    }
  });
});

// Node's fetch cancels the body of a Response that is garbage collected while its body is still
// unread and unlocked. `gc` is exposed here to reproduce that collection on demand.
setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;

/** A local server that streams `chunks` SSE events, one every 30 ms. */
const startSseServer = async (chunks: number) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream", "x-run-id": "run-gc" });
    let sent = 0;
    const timer = setInterval(() => {
      response.write(`data: ${String(sent)}\n\n`);
      sent += 1;
      if (sent === chunks) {
        clearInterval(timer);
        response.end();
      }
    }, 30);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${String(port)}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};

describe("Mastra chat gateway over a real fetch", () => {
  it("keeps the turn's stream readable when the upstream Response is garbage collected before it is read", async () => {
    const server = await startSseServer(5);
    try {
      const gateway = createMastraChatGateway({ baseUrl: server.baseUrl, serverlessToken: null });
      const sent = await gateway.send({ scope: SCOPE, agentId: "assistant", body: { messages: [{ id: "m1", role: "user", parts: [] }] } });
      if (!sent.ok) throw new Error("the send failed");
      // `/v1` awaits other work (approval audit, active run) before it reads the stream.
      for (let round = 0; round < 3; round += 1) {
        collectGarbage();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(await new Response(sent.data.body).text()).toBe("data: 0\n\ndata: 1\n\ndata: 2\n\ndata: 3\n\ndata: 4\n\n");
    } finally {
      await server.close();
    }
  });
});

describe("memoryAgentIdOf", () => {
  it("keeps the assistant and maps every custom agent to the one runtime agent that holds its memory", () => {
    expect(memoryAgentIdOf("assistant")).toBe("assistant");
    expect(memoryAgentIdOf("Ag4sK2lPq0WnR5tYu3bV")).toBe("custom-agent");
  });
});
