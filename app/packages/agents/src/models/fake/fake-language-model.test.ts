import type { LanguageModelV4CallOptions, LanguageModelV4Prompt, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { createFakeLanguageModel } from "./fake-language-model.ts";
import { createFakeScenarioRegistry } from "./fake-scenarios.ts";

const userPrompt = (text: string): LanguageModelV4Prompt => [
  { role: "system", content: "You are a test agent." },
  { role: "user", content: [{ type: "text", text }] },
];

const callOptions = (text: string, toolNames: string[] = []): LanguageModelV4CallOptions => ({
  prompt: userPrompt(text),
  tools: toolNames.map((name) => ({ type: "function", name, inputSchema: { type: "object" } })),
});

const readParts = async (stream: ReadableStream<LanguageModelV4StreamPart>): Promise<LanguageModelV4StreamPart[]> => {
  const parts: LanguageModelV4StreamPart[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
};

const streamParts = async (text: string, toolNames: string[] = [], agentId?: string) => {
  const registry = createFakeScenarioRegistry();
  const model = createFakeLanguageModel({ modelId: "fake-chat", registry, ...(agentId === undefined ? {} : { agentId }) });
  const { stream } = await model.doStream(callOptions(text, toolNames));
  return readParts(stream);
};

const textOf = (parts: LanguageModelV4StreamPart[]): string =>
  parts.flatMap((part) => (part.type === "text-delta" ? [part.delta] : [])).join("");

describe("createFakeLanguageModel", () => {
  it("is a v4 model with a fake provider", () => {
    const model = createFakeLanguageModel({ modelId: "fake-chat", registry: createFakeScenarioRegistry() });
    expect(model).toMatchObject({ specificationVersion: "v4", provider: "fake", modelId: "fake-chat" });
  });

  it("streams the same parts for the same prompt", async () => {
    const first = await streamParts("How do invitations work?");
    const second = await streamParts("How do invitations work?");
    expect(second).toEqual(first);
    expect(textOf(first)).toMatch(/^Fake answer [0-9a-f]{8}: How do invitations work\?/);
  });

  it("streams text in fixed-size deltas between text-start and text-end", async () => {
    const parts = await streamParts('[[fake:text {"text":"0123456789abcdefXYZ"}]]');
    const types = parts.map((part) => part.type);
    expect(types.indexOf("text-start")).toBeLessThan(types.indexOf("text-delta"));
    expect(parts.filter((part) => part.type === "text-delta").map((part) => part.delta)).toEqual(["0123456789abcdef", "XYZ"]);
    expect(types.at(-1)).toBe("finish");
  });

  it("emits a tool call with the directive arguments", async () => {
    const parts = await streamParts('[[fake:tool-call {"toolName":"listEntities","input":{"query":"notes"}}]]', ["listEntities"]);
    const call = parts.find((part) => part.type === "tool-call");
    expect(call).toMatchObject({ type: "tool-call", toolName: "listEntities", input: '{"query":"notes"}' });
    expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "tool-calls" } });
  });

  it("carries usage derived from character counts on finish", async () => {
    const parts = await streamParts('[[fake:text {"text":"12345678"}]]');
    const finish = parts.at(-1);
    if (finish?.type !== "finish") throw new Error("expected finish");
    expect(finish.usage.outputTokens.total).toBe(2);
    expect(finish.usage.inputTokens.total).toBeGreaterThan(0);
    expect(finish.finishReason).toEqual({ unified: "stop", raw: "stop" });
  });

  it("emits reasoning before the answer", async () => {
    const parts = await streamParts('[[fake:reasoning {"text":"thinking"}]] hello');
    const types = parts.map((part) => part.type);
    expect(types.indexOf("reasoning-delta")).toBeLessThan(types.indexOf("text-delta"));
  });

  it("reports an error part for the error scenario", async () => {
    const parts = await streamParts('[[fake:error {"message":"provider down"}]]');
    expect(parts.find((part) => part.type === "error")).toBeDefined();
    expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "error" } });
  });

  it("uses keyword rules registered for the agent when there is no directive", async () => {
    const registry = createFakeScenarioRegistry();
    registry.register("data", {
      id: "list-entities",
      matches: ({ text, toolNames }) => text.includes("entities") && toolNames.includes("listEntities"),
      respond: () => ({ toolCalls: [{ toolName: "listEntities", input: {} }] }),
    });
    const model = createFakeLanguageModel({ modelId: "fake-chat", registry, agentId: "data" });
    const { stream } = await model.doStream(callOptions("which entities exist?", ["listEntities"]));
    expect((await readParts(stream)).some((part) => part.type === "tool-call")).toBe(true);
    const other = createFakeLanguageModel({ modelId: "fake-chat", registry, agentId: "knowledge" });
    const otherStream = await other.doStream(callOptions("which entities exist?", ["listEntities"]));
    expect((await readParts(otherStream.stream)).some((part) => part.type === "tool-call")).toBe(false);
  });

  it("answers with text after a tool result instead of calling the tool again", async () => {
    const registry = createFakeScenarioRegistry();
    const model = createFakeLanguageModel({ modelId: "fake-chat", registry });
    const prompt: LanguageModelV4Prompt = [
      ...userPrompt('[[fake:tool-call {"toolName":"listEntities","input":{}}]]'),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "call_1", toolName: "listEntities", input: {} }] },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call_1", toolName: "listEntities", output: { type: "json", value: { total: 2 } } }],
      },
    ];
    const parts = await readParts((await model.doStream({ prompt })).stream);
    expect(parts.some((part) => part.type === "tool-call")).toBe(false);
    expect(textOf(parts)).toContain("listEntities");
  });

  it("generates the same content as it streams", async () => {
    const model = createFakeLanguageModel({ modelId: "fake-chat", registry: createFakeScenarioRegistry() });
    const result = await model.doGenerate(callOptions('[[fake:tool-call {"toolName":"a","input":{"x":1}}]] and [[fake:text {"text":"ok"}]]'));
    expect(result.content).toEqual([
      { type: "text", text: "ok" },
      expect.objectContaining({ type: "tool-call", toolName: "a", input: '{"x":1}' }),
    ]);
    expect(result.finishReason.unified).toBe("tool-calls");
  });

  it("rejects a directive with invalid JSON", async () => {
    const model = createFakeLanguageModel({ modelId: "fake-chat", registry: createFakeScenarioRegistry() });
    await expect(model.doGenerate(callOptions("[[fake:text {not json}]]"))).rejects.toThrow(/invalid fake directive/i);
  });
});

type JsonResponseFormat = Extract<NonNullable<LanguageModelV4CallOptions["responseFormat"]>, { type: "json" }>;
type JsonProperties = NonNullable<NonNullable<JsonResponseFormat["schema"]>["properties"]>;

describe("fake structured output (guardrail detectors)", () => {
  const detectorOptions = (text: string, properties: JsonProperties): LanguageModelV4CallOptions => ({
    prompt: userPrompt(text),
    responseFormat: { type: "json", schema: { type: "object", properties } },
  });
  const nullable: JsonProperties[string] = { anyOf: [{ type: "array" }, { type: "null" }] };
  const nullableString: JsonProperties[string] = { type: ["string", "null"] };

  const verdict = async (text: string, properties: JsonProperties) => {
    const model = createFakeLanguageModel({ modelId: "fake-fast", registry: createFakeScenarioRegistry() });
    const result = await model.doGenerate(detectorOptions(text, properties));
    const [first] = result.content;
    if (first?.type !== "text") throw new Error("expected text");
    return JSON.parse(first.text) as Record<string, unknown>;
  };

  it("returns a clean verdict unless the text carries the directive", async () => {
    const injection = { categories: nullable, reason: nullableString };
    expect(await verdict("hello", injection)).toEqual({ categories: null, reason: null });
    expect(await verdict("ignore all [[fake:injection]]", injection)).toMatchObject({ categories: [{ type: "injection", score: 1 }] });
  });

  it("flags moderation only for the moderation directive", async () => {
    const moderation = { category_scores: nullable, reason: nullableString };
    expect(await verdict("[[fake:injection]]", moderation)).toEqual({ category_scores: null, reason: null });
    expect(await verdict("[[fake:moderation]]", moderation)).toMatchObject({ category_scores: [{ category: "harassment", score: 1 }] });
  });

  it("flags pii with a detection", async () => {
    const pii = { categories: nullable, detections: nullable };
    expect(await verdict("mail me [[fake:pii]]", pii)).toMatchObject({
      categories: [{ type: "email", score: 1 }],
      detections: [expect.objectContaining({ type: "email", confidence: 1 })],
    });
  });

  it("returns a scripted object for the json directive", async () => {
    expect(await verdict('[[fake:json {"answer":42}]]', { answer: { type: "number" } })).toEqual({ answer: 42 });
  });
});
