import { describe, expect, it } from "vitest";
import { CONVERSATION_ID_PATTERN, newConversationId, startsConversationRun } from "./conversation-id.ts";

const post = (path: string) => new Request(`http://mastra.internal${path}`, { method: "POST" });

describe("newConversationId", () => {
  it("builds 20 characters of the Firestore id alphabet", () => {
    const id = newConversationId();
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(CONVERSATION_ID_PATTERN.test(id)).toBe(true);
  });

  it("draws every character from the random source", () => {
    expect(newConversationId(() => 0)).toBe("AAAAAAAAAAAAAAAAAAAA");
    expect(newConversationId((max) => max - 1)).toBe("99999999999999999999");
  });

  it("gives different ids on each call", () => {
    expect(new Set(Array.from({ length: 50 }, () => newConversationId())).size).toBe(50);
  });
});

describe("startsConversationRun", () => {
  it("is true for agent generate and stream runs and for MCP server calls", () => {
    expect(startsConversationRun(post("/api/agents/assistant/generate"))).toBe(true);
    expect(startsConversationRun(post("/api/agents/assistant/stream"))).toBe(true);
    expect(startsConversationRun(post("/api/mcp/core/mcp"))).toBe(true);
  });

  it("is false for approvals, memory routes, reads and paths outside the prefix", () => {
    expect(startsConversationRun(post("/api/agents/assistant/approve-tool-call"))).toBe(false);
    expect(startsConversationRun(post("/api/memory/threads/Cv3sK2lPq0WnR5tYu3bV/messages"))).toBe(false);
    expect(startsConversationRun(new Request("http://mastra.internal/api/agents/assistant/generate"))).toBe(false);
    expect(startsConversationRun(post("/other/agents/assistant/generate"))).toBe(false);
  });

  it("is true for a chat turn outside the prefix (SP4), not for its observe or abort routes", () => {
    expect(startsConversationRun(post("/chat/assistant"))).toBe(true);
    expect(startsConversationRun(post("/chat/runs/run-1/abort"))).toBe(false);
    expect(startsConversationRun(new Request("http://mastra.internal/chat/assistant"))).toBe(false);
  });

  it("honors a custom API prefix", () => {
    expect(startsConversationRun(post("/mastra/agents/assistant/stream"), "/mastra/")).toBe(true);
    expect(startsConversationRun(post("/api/agents/assistant/stream"), "/mastra")).toBe(false);
  });
});
