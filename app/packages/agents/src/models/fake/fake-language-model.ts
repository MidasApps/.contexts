import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { extractCitationIds } from "../../knowledge/citation.ts";
import { deferred } from "./deferred.ts";
import { buildFakeJsonAnswer } from "./fake-structured-output.ts";
import {
  type FakeScenarioRegistry,
  type FakeTurn,
  hashText,
  readStreamDelay,
  resolveFakeTurn,
} from "./fake-scenarios.ts";

/**
 * Scripted, deterministic `LanguageModelV4` for `AI_MODE=fake` (spec §5.3,
 * decision 0021). Ships in `@core/agents` (not `ai/test`) because dev and e2e
 * run it. Emits real stream parts, so tracing, usage, approvals and UI behave as
 * with a provider.
 */
export type FakeLanguageModelOptions = {
  readonly modelId: string;
  readonly registry: FakeScenarioRegistry;
  /** Agent whose keyword rules apply (`registerFakeScenario`). */
  readonly agentId?: string;
};

const CHUNK_SIZE = 16;
const CHARS_PER_TOKEN = 4;
const FIXED_TIMESTAMP = new Date(0);

type PromptParts = { lastUserText: string; allText: string; lastRole: string | undefined };

const partText = (part: { type: string; text?: string; output?: unknown; input?: unknown }): string => {
  if (typeof part.text === "string") return part.text;
  if (part.output !== undefined) return JSON.stringify(part.output);
  return part.input === undefined ? "" : JSON.stringify(part.input);
};

const readPrompt = (prompt: LanguageModelV4Prompt): PromptParts => {
  const texts = prompt.map((message) =>
    typeof message.content === "string" ? message.content : message.content.map((part) => partText(part)).join("\n"),
  );
  const lastUserIndex = prompt.findLastIndex((message) => message.role === "user");
  return { lastUserText: lastUserIndex < 0 ? "" : (texts[lastUserIndex] ?? ""), allText: texts.join("\n"), lastRole: prompt.at(-1)?.role };
};

type ToolResultSummary = { toolName: string; output: unknown };

const lastToolResults = (prompt: LanguageModelV4Prompt): ToolResultSummary[] => {
  const last = prompt.at(-1);
  if (last?.role !== "tool") return [];
  return last.content.flatMap((part) => (part.type === "tool-result" ? [{ toolName: part.toolName, output: part.output }] : []));
};

// A summary cites the knowledge passages it saw, like a grounded model would.
const citationsOf = (output: unknown): string => {
  const ids = extractCitationIds(JSON.stringify(output) ?? "");
  return ids.length === 0 ? "" : ` ${ids.map((id) => `[${id}]`).join(" ")}`;
};

const summarizeToolResults = (results: readonly ToolResultSummary[]): FakeTurn => ({
  text: results.map(({ toolName, output }) => `Fake summary of ${toolName}: ${JSON.stringify(output).slice(0, 200)}${citationsOf(output)}`).join("\n"),
});

const toolNamesOf = (options: LanguageModelV4CallOptions): string[] => (options.tools ?? []).map((tool) => tool.name);

type PlannedTurn = { turn: FakeTurn; json: string | undefined; promptText: string; seed: string };

const planTurn = (options: LanguageModelV4CallOptions, settings: FakeLanguageModelOptions): PlannedTurn => {
  const { lastUserText, allText, lastRole } = readPrompt(options.prompt);
  const seed = hashText(allText);
  if (options.responseFormat?.type === "json") {
    return { turn: {}, json: buildFakeJsonAnswer(options.responseFormat.schema, allText), promptText: allText, seed };
  }
  const results = lastRole === "tool" ? lastToolResults(options.prompt) : [];
  const turn =
    results.length > 0
      ? summarizeToolResults(results)
      : resolveFakeTurn({ agentId: settings.agentId, text: lastUserText, toolNames: toolNamesOf(options) }, settings.registry);
  return { turn, json: undefined, promptText: allText, seed };
};

const tokens = (chars: number): number => Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN));

const usageOf = (planned: PlannedTurn, outputText: string): LanguageModelV4Usage => {
  const input = tokens(planned.promptText.length);
  const output = outputText.length === 0 ? 0 : tokens(outputText.length);
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
};

const finishReasonOf = (turn: FakeTurn): LanguageModelV4FinishReason => {
  if (turn.error !== undefined) return { unified: "error", raw: "error" };
  if ((turn.toolCalls?.length ?? 0) > 0) return { unified: "tool-calls", raw: "tool_calls" };
  return { unified: "stop", raw: "stop" };
};

/** Content in a fixed order: reasoning, text, tool calls. */
const contentOf = (planned: PlannedTurn): LanguageModelV4Content[] => {
  if (planned.json !== undefined) return [{ type: "text", text: planned.json }];
  const { turn, seed } = planned;
  const reasoning: LanguageModelV4Content[] = turn.reasoning === undefined ? [] : [{ type: "reasoning", text: turn.reasoning }];
  const text: LanguageModelV4Content[] = turn.text === undefined ? [] : [{ type: "text", text: turn.text }];
  const calls: LanguageModelV4Content[] = (turn.toolCalls ?? []).map((call, index) => ({
    type: "tool-call",
    toolCallId: `call_${seed.slice(0, 12)}_${index}`,
    toolName: call.toolName,
    input: JSON.stringify(call.input),
  }));
  return [...reasoning, ...text, ...calls];
};

const outputTextOf = (content: readonly LanguageModelV4Content[]): string =>
  content.map((part) => (part.type === "text" || part.type === "reasoning" ? part.text : part.type === "tool-call" ? part.input : "")).join("");

const chunk = (text: string): string[] => {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += CHUNK_SIZE) chunks.push(text.slice(start, start + CHUNK_SIZE));
  return chunks;
};

const streamPartsOf = (content: readonly LanguageModelV4Content[], id: string): LanguageModelV4StreamPart[] =>
  content.flatMap((part, index): LanguageModelV4StreamPart[] => {
    const partId = `${id}-${index}`;
    if (part.type === "text" || part.type === "reasoning") {
      const kind = part.type;
      return [
        { type: `${kind}-start`, id: partId },
        ...chunk(part.text).map((delta) => ({ type: `${kind}-delta` as const, id: partId, delta })),
        { type: `${kind}-end`, id: partId },
      ];
    }
    if (part.type !== "tool-call") return [];
    return [
      { type: "tool-input-start", id: part.toolCallId, toolName: part.toolName },
      { type: "tool-input-delta", id: part.toolCallId, delta: part.input },
      { type: "tool-input-end", id: part.toolCallId },
      part,
    ];
  });

/**
 * Builds a fake model; the same prompt always yields the same parts.
 * @throws {InvalidFakeDirectiveError} (from `doGenerate`/`doStream`) on malformed directives.
 */
export const createFakeLanguageModel = (settings: FakeLanguageModelOptions): LanguageModelV4 => ({
  specificationVersion: "v4",
  provider: "fake",
  modelId: settings.modelId,
  supportedUrls: {},
  doGenerate: (options) =>
    deferred(() => {
      const planned = planTurn(options, settings);
      if (planned.turn.error !== undefined) throw new Error(planned.turn.error);
      const content = contentOf(planned);
      return { content, finishReason: finishReasonOf(planned.turn), usage: usageOf(planned, outputTextOf(content)), warnings: [] };
    }),
  doStream: (options) =>
    deferred(() => {
      const planned = planTurn(options, settings);
      const content = contentOf(planned);
      const id = `fake-${planned.seed.slice(0, 12)}`;
      const errorParts: LanguageModelV4StreamPart[] = planned.turn.error === undefined ? [] : [{ type: "error", error: new Error(planned.turn.error) }];
      const chunks: LanguageModelV4StreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "response-metadata", id, modelId: settings.modelId, timestamp: FIXED_TIMESTAMP },
        ...streamPartsOf(content, id),
        ...errorParts,
        { type: "finish", usage: usageOf(planned, outputTextOf(content)), finishReason: finishReasonOf(planned.turn) },
      ];
      const delay = readStreamDelay(readPrompt(options.prompt).lastUserText);
      return { stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: delay }) };
    }),
});
