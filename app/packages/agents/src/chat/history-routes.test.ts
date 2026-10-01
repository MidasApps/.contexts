import type { Agent } from "@mastra/core/agent";
import type { Mastra } from "@mastra/core/mastra";
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { handleMessages, handleSummary } from "./history-routes.ts";

const THREAD = "HistThread0000000001";
const RESOURCE = "tenant-1:user-1";
const silentLogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const deps = { chatAgents: { assistant: "assistant-chat" }, logger: silentLogger };

const stored = (id: string, role: "user" | "assistant", text: string, minute: number) => ({
  id,
  role,
  threadId: THREAD,
  resourceId: RESOURCE,
  createdAt: new Date(Date.UTC(2026, 8, 30, 12, minute)),
  content: { format: 2, parts: [{ type: "text", text }] },
});

/** A Mastra whose memory store answers newest first, like `orderBy createdAt DESC`. */
const mastraWith = (messages: ReturnType<typeof stored>[], seen: unknown[] = []) =>
  ({
    getStorage: () => ({
      getStore: () =>
        Promise.resolve({
          listMessages: (args: unknown) => {
            seen.push(args);
            return Promise.resolve({ messages: [...messages].reverse(), hasMore: false, total: messages.length, page: 0, perPage: 50 });
          },
        }),
    }),
  }) as unknown as Mastra;

const contextFor = (thread: string | null = THREAD) => {
  const context = new RequestContext<unknown>([["requestId", "01J8Z3K4M5N6P7Q8R9S0T1V2W3"]]);
  context.set(MASTRA_RESOURCE_ID_KEY, RESOURCE);
  if (thread !== null) context.set(MASTRA_THREAD_ID_KEY, thread);
  return context;
};

const url = (query = "") => new URL(`http://mastra.internal/chat/assistant/messages${query}`);

describe("history routes", () => {
  it("lists the caller's thread as v7 UI messages in chronological order, newest page first", async () => {
    const seen: unknown[] = [];
    const mastra = mastraWith([stored("m1", "user", "Hello", 1), stored("m2", "assistant", "Hi there", 2)], seen);
    const response = await handleMessages({ agentId: "assistant", requestContext: contextFor(), mastra, url: url("?page=0&perPage=20") }, deps);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string; role: string; parts: { type: string; text?: string }[] }[]; meta: { hasMore: boolean } };
    expect(body.data.map((message) => [message.id, message.role])).toEqual([
      ["m1", "user"],
      ["m2", "assistant"],
    ]);
    expect(body.data[0]?.parts).toContainEqual(expect.objectContaining({ type: "text", text: "Hello" }));
    expect(body.meta).toEqual({ hasMore: false });
    expect(seen[0]).toMatchObject({ threadId: THREAD, resourceId: RESOURCE, page: 0, perPage: 20, orderBy: { field: "createdAt", direction: "DESC" } });
  });

  it("refuses an unknown agent, a bad page and a request without a thread", async () => {
    const mastra = mastraWith([]);
    expect((await handleMessages({ agentId: "ping", requestContext: contextFor(), mastra, url: url() }, deps)).status).toBe(404);
    expect((await handleMessages({ agentId: "assistant", requestContext: contextFor(), mastra, url: url("?perPage=500") }, deps)).status).toBe(400);
    expect((await handleMessages({ agentId: "assistant", requestContext: contextFor(null), mastra, url: url() }, deps)).status).toBe(403);
  });

  it("summarizes the transcript with the summarizer and caps the answer", async () => {
    const prompts: string[] = [];
    const summarizer = {
      generate: (prompt: string) => {
        prompts.push(prompt);
        return Promise.resolve({ text: `  ${"s".repeat(3000)}  ` });
      },
    } as unknown as Agent;
    const mastra = mastraWith([stored("m1", "user", "Plan the onboarding", 1), stored("m2", "assistant", "Here is a plan", 2)]);
    const response = await handleSummary({ agentId: "assistant", requestContext: contextFor(), mastra, url: url() }, { ...deps, summarizer });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { summary: string } }).data.summary).toHaveLength(2000);
    expect(prompts[0]).toBe("user: Plan the onboarding\nassistant: Here is a plan");
  });

  it("answers 409 when the conversation has nothing to summarize", async () => {
    const summarizer = { generate: () => Promise.reject(new Error("must not run")) } as unknown as Agent;
    const response = await handleSummary({ agentId: "assistant", requestContext: contextFor(), mastra: mastraWith([]), url: url() }, { ...deps, summarizer });
    expect(response.status).toBe(409);
  });
});
