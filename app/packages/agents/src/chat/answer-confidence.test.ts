import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { confidenceOfDelegation, mergeConfidence, withAnswerConfidence } from "./answer-confidence.ts";
import { createChatStreamTap } from "./tool-preview.ts";

const DOC = "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f";
const KNOWN = `kb:${DOC}#1`;
const search = (ids: readonly string[]) => [{ toolName: "knowledge_searchKnowledge", toolCallId: "s-1", result: { results: ids.map((citationId) => ({ citationId })) } }];
const grounded = { text: `Files are kept for 30 days [${KNOWN}].`, subAgentToolResults: search([KNOWN]) };
const uncited = { text: "Probably 30 days.", subAgentToolResults: search([KNOWN]) };

describe("confidenceOfDelegation", () => {
  it("is normal when the knowledge answer cites a passage retrieved in the delegation", () => {
    expect(confidenceOfDelegation(grounded)).toBe("normal");
  });

  it("is low without a citation, or with a citation of a passage that was not retrieved", () => {
    expect(confidenceOfDelegation(uncited)).toBe("low");
    expect(confidenceOfDelegation({ text: grounded.text, subAgentToolResults: search([]) })).toBe("low");
    expect(confidenceOfDelegation({ text: grounded.text })).toBe("low");
  });

  it("is undefined for an output of another shape", () => {
    expect(confidenceOfDelegation("text")).toBeUndefined();
    expect(confidenceOfDelegation({ subAgentToolResults: [] })).toBeUndefined();
  });

  it("merges several delegations as grounded once any is", () => {
    expect(mergeConfidence(undefined, "low")).toBe("low");
    expect(mergeConfidence("low", "normal")).toBe("normal");
    expect(mergeConfidence("normal", "low")).toBe("normal");
    expect(mergeConfidence("low", undefined)).toBe("low");
  });
});

const pipe = async (chunks: UIMessageChunk[]): Promise<UIMessageChunk[]> => {
  const source = new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const tap = createChatStreamTap({ previewer: { describe: () => Promise.reject(new Error("no approval in this stream")) }, requestContext: new Map(), onState: () => undefined });
  const out: UIMessageChunk[] = [];
  for await (const chunk of source.pipeThrough(tap) as unknown as AsyncIterable<UIMessageChunk>) out.push(chunk);
  return out;
};

const delegation = (toolCallId: string, toolName: string, output: unknown): UIMessageChunk[] => [
  { type: "tool-input-available", toolCallId, toolName, input: { prompt: "How long are files kept?" } },
  { type: "tool-output-available", toolCallId, output },
];

describe("chat stream tap: answer confidence (SP0 follow-up #42)", () => {
  it("writes message-metadata confidence low right after an uncited knowledge delegation, before the answer text", async () => {
    const out = await pipe([{ type: "start" }, ...delegation("c-1", "agent-knowledge", uncited), { type: "text-start", id: "t" }, { type: "finish" }]);
    expect(out.map((chunk) => chunk.type)).toEqual(["start", "tool-input-available", "tool-output-available", "message-metadata", "text-start", "finish"]);
    expect(out[3]).toEqual({ type: "message-metadata", messageMetadata: { confidence: "low" } });
  });

  it("writes normal for a grounded delegation and nothing for other tools", async () => {
    const out = await pipe([...delegation("c-1", "agent-data", uncited), ...delegation("c-2", "agent-knowledge", grounded)]);
    expect(out.filter((chunk) => chunk.type === "message-metadata")).toEqual([{ type: "message-metadata", messageMetadata: { confidence: "normal" } }]);
  });

  it("does not repeat the metadata when a later delegation changes nothing", async () => {
    const out = await pipe([...delegation("c-1", "agent-knowledge", grounded), ...delegation("c-2", "agent-knowledge", uncited)]);
    expect(out.filter((chunk) => chunk.type === "message-metadata")).toHaveLength(1);
  });
});

describe("withAnswerConfidence (history)", () => {
  const assistant = (parts: unknown[], metadata?: unknown): UIMessage => ({ id: "a-1", role: "assistant", parts, ...(metadata === undefined ? {} : { metadata }) }) as UIMessage;
  const part = (output: unknown, state = "output-available") => ({ type: "tool-agent-knowledge", toolCallId: "c-1", state, input: {}, output });

  it("sets the confidence of a stored answer from its knowledge delegation and keeps other metadata", () => {
    const [message] = withAnswerConfidence([assistant([part(uncited), { type: "text", text: "Probably." }], { agentId: "assistant" })]);
    expect(message?.metadata).toEqual({ agentId: "assistant", confidence: "low" });
  });

  it("leaves answers without a finished knowledge delegation and user messages untouched", () => {
    const plain = assistant([{ type: "text", text: "Hello" }]);
    const pending = assistant([part(undefined, "input-available")]);
    const user = { id: "u-1", role: "user", parts: [part(uncited)] } as unknown as UIMessage;
    expect(withAnswerConfidence([plain, pending, user])).toEqual([plain, pending, user]);
  });
});
