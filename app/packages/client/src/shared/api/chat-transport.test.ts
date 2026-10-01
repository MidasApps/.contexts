import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api-error.ts";
import { createChatTransport, type ChatTransportOptions } from "./chat-transport.ts";

type Call = { url: string; method: string; headers: Headers; body: unknown };

const sse = (chunks: readonly UIMessageChunk[]): string => `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;

const streamResponse = (chunks: readonly UIMessageChunk[], headers: Record<string, string> = {}): Response =>
  new Response(sse(chunks), { status: 200, headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1", ...headers } });

const ANSWER: UIMessageChunk[] = [
  { type: "start", messageId: "a-1" },
  { type: "text-start", id: "t-1" },
  { type: "text-delta", id: "t-1", delta: "Olá" },
  { type: "text-end", id: "t-1" },
  { type: "finish" },
];

const envelope = (status: number, code: string): Response =>
  new Response(JSON.stringify({ error: { code, message: "Fake failure.", requestId: "01K6REQ" } }), { status, headers: { "content-type": "application/json" } });

const setup = (respond: (call: Call, index: number) => Response | Promise<Response>, overrides: Partial<ChatTransportOptions> = {}) => {
  const calls: Call[] = [];
  let conversationId: string | undefined;
  let tokenCount = 0;
  const transport = createChatTransport({
    baseUrl: "https://api.test",
    getIdToken: ({ forceRefresh }) => {
      tokenCount += 1;
      return Promise.resolve(`token-${tokenCount}${forceRefresh ? "-fresh" : ""}`);
    },
    fetch: async (input, init = {}) => {
      const call = { url: input, method: init.method ?? "GET", headers: new Headers(init.headers), body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined };
      calls.push(call);
      return respond(call, calls.length - 1);
    },
    getScope: () => ({ organizationId: "org-1", projectId: "proj-1" }),
    getConversationId: () => conversationId,
    onConversationId: (id) => {
      conversationId = id;
    },
    newRequestId: () => `req-${calls.length + 1}`,
    ...overrides,
  });
  return {
    transport,
    calls,
    conversation: () => conversationId,
    setConversation: (id: string | undefined) => {
      conversationId = id;
    },
  };
};

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });

const drain = async (stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
};

const send = (transport: ReturnType<typeof setup>["transport"], messages: UIMessage[], extra: { trigger?: "submit-message" | "regenerate-message"; body?: object } = {}) =>
  transport.sendMessages({ chatId: "chat-1", messageId: undefined, messages, abortSignal: undefined, trigger: extra.trigger ?? "submit-message", ...(extra.body === undefined ? {} : { body: extra.body }) });

describe("createChatTransport", () => {
  it("posts only the last message to /v1/chat with a Bearer token and a request id", async () => {
    const { transport, calls } = setup(() => streamResponse(ANSWER, { "x-conversation-id": "conv-9" }));
    const history: UIMessage[] = [user("u-1", "primeira"), { id: "a-0", role: "assistant", parts: [{ type: "text", text: "resposta" }] }, user("u-2", "segunda")];
    const chunks = await drain(await send(transport, history));
    expect(chunks.map((chunk) => chunk.type)).toEqual(["start", "text-start", "text-delta", "text-end", "finish"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.test/v1/chat");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer token-1");
    expect(calls[0]?.headers.get("x-request-id")).toBe("req-1");
    expect(calls[0]?.body).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      message: { id: "u-2", role: "user", parts: [{ type: "text", text: "segunda" }] },
      trigger: "submit-message",
    });
  });

  it("reads the conversation id from the response header and sends it instead of the organization afterwards", async () => {
    const { transport, calls, conversation } = setup(() => streamResponse(ANSWER, { "x-conversation-id": "conv-9" }));
    await drain(await send(transport, [user("u-1", "oi")]));
    expect(conversation()).toBe("conv-9");
    await drain(await send(transport, [user("u-1", "oi"), user("u-2", "de novo")]));
    expect(calls[1]?.body).toEqual({ conversationId: "conv-9", message: { id: "u-2", role: "user", parts: [{ type: "text", text: "de novo" }] }, trigger: "submit-message" });
  });

  it("asks for a fresh token on every request", async () => {
    const { transport, calls } = setup(() => streamResponse(ANSWER));
    await drain(await send(transport, [user("u-1", "a")]));
    await drain(await send(transport, [user("u-2", "b")]));
    expect(calls.map((call) => call.headers.get("authorization"))).toEqual(["Bearer token-1", "Bearer token-2"]);
  });

  it("retries once with a forced token refresh after a 401", async () => {
    const { transport, calls } = setup((_call, index) => (index === 0 ? envelope(401, "UNAUTHENTICATED") : streamResponse(ANSWER)));
    await drain(await send(transport, [user("u-1", "a")]));
    expect(calls.map((call) => call.headers.get("authorization"))).toEqual(["Bearer token-1", "Bearer token-2-fresh"]);
  });

  it("drops everything but text from a user message", async () => {
    const { transport, calls } = setup(() => streamResponse(ANSWER));
    const message = { id: "u-1", role: "user", metadata: { secret: true }, parts: [{ type: "text", text: "veja" }, { type: "file", mediaType: "image/png", url: "https://evil.test/x.png" }] } as UIMessage;
    await drain(await send(transport, [message]));
    expect((calls[0]?.body as { message: unknown }).message).toEqual({ id: "u-1", role: "user", parts: [{ type: "text", text: "veja" }] });
  });

  it("sends the attachments of the message's own metadata when the turn is sent again without a body", async () => {
    const { transport, calls } = setup(() => streamResponse(ANSWER));
    const message = { ...user("u-1", "veja"), metadata: { attachments: [{ fileId: "file-9", name: "a.png", mediaType: "image/png", sizeBytes: 5 }] } };
    await drain(await send(transport, [message], { trigger: "regenerate-message" }));
    expect(calls[0]?.body).toMatchObject({ attachments: ["file-9"], trigger: "regenerate-message" });
  });

  it("sends attachments given in the request body by file id and nothing else of that body", async () => {
    const { transport, calls } = setup(() => streamResponse(ANSWER));
    await drain(await send(transport, [user("u-1", "veja")], { body: { attachments: ["file-1", "file-2"], maxSteps: 99 } }));
    expect(calls[0]?.body).toMatchObject({ attachments: ["file-1", "file-2"] });
    expect(calls[0]?.body).not.toHaveProperty("maxSteps");
  });

  it("reduces an approval message to the answered approval parts and their contract fields", async () => {
    const { transport, calls, setConversation } = setup(() => streamResponse(ANSWER));
    setConversation("conv-9");
    const assistant = {
      id: "a-1",
      role: "assistant",
      metadata: { confidence: "low" },
      parts: [
        { type: "step-start" },
        { type: "reasoning", text: "pensando" },
        { type: "text", text: "Vou criar o projeto." },
        { type: "tool-agent-knowledge", toolCallId: "c-0", state: "output-available", input: { prompt: "x" }, output: { text: "y" } },
        { type: "tool-agent-action", toolCallId: "c-1", state: "approval-responded", input: { prompt: "create" }, approval: { id: "run-1::c-1", approved: false, reason: "  Nome errado  " } },
        { type: "data-tool-preview", id: "c-1", data: { toolCallId: "c-1" } },
      ],
    } as unknown as UIMessage;
    await drain(await send(transport, [user("u-1", "crie"), assistant]));
    expect(calls[0]?.body).toEqual({
      conversationId: "conv-9",
      message: {
        id: "a-1",
        role: "assistant",
        parts: [{ type: "tool-agent-action", toolCallId: "c-1", state: "approval-responded", approval: { id: "run-1::c-1", approved: false, reason: "Nome errado" } }],
      },
      trigger: "submit-message",
    });
  });

  it("sends the last user message when regenerating", async () => {
    const { transport, calls, setConversation } = setup(() => streamResponse(ANSWER));
    setConversation("conv-9");
    await drain(await send(transport, [user("u-1", "oi")], { trigger: "regenerate-message" }));
    expect(calls[0]?.body).toEqual({ conversationId: "conv-9", message: { id: "u-1", role: "user", parts: [{ type: "text", text: "oi" }] }, trigger: "regenerate-message" });
  });

  it("turns an error envelope into an ApiError with the code and request id", async () => {
    const { transport } = setup(() => envelope(429, "RATE_LIMITED"));
    const failure: unknown = await send(transport, [user("u-1", "a")]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 429, code: "RATE_LIMITED", requestId: "01K6REQ" });
  });

  it("maps a non-envelope failure to INVALID_RESPONSE and a network failure to NETWORK_ERROR", async () => {
    const proxy = setup(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(send(proxy.transport, [user("u-1", "a")])).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502, requestId: "req-1" });
    const offline = setup(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(send(offline.transport, [user("u-1", "a")])).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  });

  it("resumes from /v1/chat/{id}/stream and answers null on 204 or without a conversation", async () => {
    const { transport, calls, setConversation } = setup((call) => (call.url.endsWith("/stream") ? new Response(null, { status: 204 }) : streamResponse(ANSWER)));
    expect(await transport.reconnectToStream({ chatId: "chat-1" })).toBeNull();
    expect(calls).toHaveLength(0);
    setConversation("conv 9/x");
    expect(await transport.reconnectToStream({ chatId: "chat-1" })).toBeNull();
    expect(calls[0]?.url).toBe("https://api.test/v1/chat/conv%209%2Fx/stream");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer token-1");
  });

  it("replays a resumed stream", async () => {
    const { transport, setConversation } = setup(() => streamResponse(ANSWER));
    setConversation("conv-9");
    const stream = await transport.reconnectToStream({ chatId: "chat-1" });
    expect(stream).not.toBeNull();
    expect((await drain(stream as ReadableStream<UIMessageChunk>)).at(-1)?.type).toBe("finish");
  });
});
