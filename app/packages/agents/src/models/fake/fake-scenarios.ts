import { createHash } from "node:crypto";

/**
 * Scenarios of the scripted fake model (spec §5.3, decision 0021). A turn is
 * picked from, in order: a tool result to summarize, `[[fake:<scenario> <json>]]`
 * directives in the last user message, keyword rules registered per agent, and
 * a deterministic echo built from the prompt hash.
 */

export type FakeToolCall = { readonly toolName: string; readonly input: Readonly<Record<string, unknown>> };

export type FakeTurn = {
  readonly text?: string;
  readonly reasoning?: string;
  readonly toolCalls?: readonly FakeToolCall[];
  /** Emits an `error` part and finishes with reason `error`. */
  readonly error?: string;
};

export type FakeTurnContext = {
  readonly agentId: string | undefined;
  /** Last user message text, directives included. */
  readonly text: string;
  readonly toolNames: readonly string[];
};

export type FakeScenarioRule = {
  readonly id: string;
  readonly matches: (context: FakeTurnContext) => boolean;
  readonly respond: (context: FakeTurnContext) => FakeTurn;
};

export type FakeScenarioRegistry = {
  readonly register: (agentId: string, rule: FakeScenarioRule) => void;
  readonly rulesFor: (agentId: string | undefined) => readonly FakeScenarioRule[];
};

/** Keyword rules per agent; rules match in registration order. */
export const createFakeScenarioRegistry = (): FakeScenarioRegistry => {
  const rules = new Map<string, FakeScenarioRule[]>();
  return {
    register: (agentId, rule) => rules.set(agentId, [...(rules.get(agentId) ?? []), rule]),
    rulesFor: (agentId) => (agentId === undefined ? [] : (rules.get(agentId) ?? [])),
  };
};

export type FakeDirective = { readonly scenario: string; readonly args: Readonly<Record<string, unknown>> };

export class InvalidFakeDirectiveError extends Error {
  readonly code = "INVALID_FAKE_DIRECTIVE";
  constructor(directive: string, options?: ErrorOptions) {
    super(`Invalid fake directive: ${directive}`, options);
    this.name = "InvalidFakeDirectiveError";
  }
}

// Lazy JSON body: `}` must be followed by `]]`, so nested objects still match.
const DIRECTIVE_PATTERN = /\[\[fake:([a-z][a-z-]*)(?:\s+(\{[\s\S]*?\}))?\]\]/g;

const parseArgs = (raw: string | undefined, directive: string): Record<string, unknown> => {
  if (raw === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch (error: unknown) {
    throw new InvalidFakeDirectiveError(directive, { cause: error });
  }
  throw new InvalidFakeDirectiveError(directive);
};

/**
 * Every `[[fake:...]]` directive in `text`, in order.
 * @throws {InvalidFakeDirectiveError} when a directive body is not a JSON object.
 */
export const parseFakeDirectives = (text: string): FakeDirective[] =>
  [...text.matchAll(DIRECTIVE_PATTERN)].map((match) => ({ scenario: match[1] ?? "", args: parseArgs(match[2], match[0]) }));

/** A directive without JSON that also has an unparseable body is still invalid. */
export const assertNoMalformedDirectives = (text: string): void => {
  const withoutValid = text.replace(DIRECTIVE_PATTERN, "");
  const malformed = /\[\[fake:[^\]]*\]\]/.exec(withoutValid);
  if (malformed !== null) throw new InvalidFakeDirectiveError(malformed[0]);
};

export const stripFakeDirectives = (text: string): string => text.replace(DIRECTIVE_PATTERN, " ").replace(/\s+/g, " ").trim();

export const hashText = (text: string): string => createHash("sha256").update(text).digest("hex");

const readString = (args: Readonly<Record<string, unknown>>, key: string): string | undefined =>
  typeof args[key] === "string" ? args[key] : undefined;

const toolCallFrom = (args: Readonly<Record<string, unknown>>): FakeToolCall => {
  const toolName = readString(args, "toolName");
  if (toolName === undefined) throw new InvalidFakeDirectiveError("tool-call without toolName");
  const input = args.input;
  const isObject = typeof input === "object" && input !== null && !Array.isArray(input);
  return { toolName, input: isObject ? (input as Record<string, unknown>) : {} };
};

/** Scenarios that shape the chat turn; others (`injection`, `pii`, `slow`, ...) are read elsewhere. */
const turnFromDirectives = (directives: readonly FakeDirective[]): FakeTurn | undefined => {
  let turn: FakeTurn | undefined;
  for (const { scenario, args } of directives) {
    if (scenario === "text") turn = { ...turn, text: `${turn?.text ?? ""}${readString(args, "text") ?? ""}` };
    if (scenario === "reasoning") turn = { ...turn, reasoning: readString(args, "text") ?? "" };
    if (scenario === "tool-call") turn = { ...turn, toolCalls: [...(turn?.toolCalls ?? []), toolCallFrom(args)] };
    if (scenario === "error") turn = { ...turn, error: readString(args, "message") ?? "fake provider error" };
  }
  return turn;
};

export const echoText = (text: string): string => {
  const clean = stripFakeDirectives(text);
  return `Fake answer ${hashText(clean).slice(0, 8)}: ${clean.slice(0, 160)}`;
};

/**
 * Picks the turn for a user message (tool follow-ups are handled by the model).
 * @throws {InvalidFakeDirectiveError} for malformed directives, so tests fail loudly.
 */
export const resolveFakeTurn = (context: FakeTurnContext, registry: FakeScenarioRegistry): FakeTurn => {
  assertNoMalformedDirectives(context.text);
  const directives = parseFakeDirectives(context.text);
  const scripted = turnFromDirectives(directives);
  const needsAnswer = scripted !== undefined && scripted.text === undefined && scripted.toolCalls === undefined && scripted.error === undefined;
  if (scripted !== undefined && !needsAnswer) return scripted;
  const rule = registry.rulesFor(context.agentId).find((candidate) => candidate.matches(context));
  const base = rule?.respond(context) ?? { text: echoText(context.text) };
  return scripted?.reasoning === undefined ? base : { ...base, reasoning: scripted.reasoning };
};

/** `[[fake:slow {"delayMs":n}]]` slows streaming for e2e stop tests; default 25 ms per chunk. */
export const readStreamDelay = (text: string): number | null => {
  const slow = parseFakeDirectives(text).find((directive) => directive.scenario === "slow");
  if (slow === undefined) return null;
  const delay = slow.args.delayMs;
  return typeof delay === "number" && delay >= 0 ? delay : 25;
};

/** A command as the fake data and action agents see it (from `formCommandsOf`). */
export type FakeCommandRef = { readonly toolId: string; readonly commandId: string; readonly targetContractId: string };

const QUESTION = /\?|^\s*(what|how|who|when|where|why|which|is|are|does|do|can)\b/i;
const CONFIRMED = /\b(confirm|confirmed|submit|go ahead)\b/i;
const CREATE_WORD = /\b(?:create|add|new)\s+(?:a|an|the)?\s*([a-z][a-z-]*)/i;
const NAMED = /named\s+"([^"]{1,120})"/i;

/** Mastra sends tool names to the model sanitized (`catalog.renderForm` → `catalog_renderForm`). */
const modelToolName = (toolNames: readonly string[], toolId: string): string | undefined =>
  toolNames.find((name) => name === toolId || name === toolId.replace(/[^A-Za-z0-9_-]/g, "_"));

const delegation = (id: string, agentKey: string, pattern: RegExp): FakeScenarioRule => ({
  id,
  matches: ({ text, toolNames }) => toolNames.includes(`agent-${agentKey}`) && pattern.test(stripFakeDirectives(text)),
  respond: ({ text }) => ({ toolCalls: [{ toolName: `agent-${agentKey}`, input: { prompt: stripFakeDirectives(text) } }] }),
});

const contractName = (contractId: string): string => (contractId.split(".").at(-1) ?? contractId).toLowerCase();

const renderFormRule = (commands: readonly FakeCommandRef[]): FakeScenarioRule => {
  const commandFor = (text: string) => {
    const word = CREATE_WORD.exec(text)?.[1]?.toLowerCase();
    return commands.find((command) => word !== undefined && contractName(command.targetContractId) === word);
  };
  return {
    id: "data-render-form",
    matches: ({ text, toolNames }) => modelToolName(toolNames, "catalog.renderForm") !== undefined && commandFor(text) !== undefined,
    respond: ({ text, toolNames }) => {
      const command = commandFor(text);
      const input = { contractId: command?.targetContractId, mode: "create", commandId: command?.commandId };
      return { toolCalls: [{ toolName: modelToolName(toolNames, "catalog.renderForm") ?? "catalog.renderForm", input }] };
    },
  };
};

const runCommandRule: FakeScenarioRule = {
  id: "action-run-command",
  matches: ({ text, toolNames }) => NAMED.test(text) && toolNames.some((name) => /^command[._]/.test(name)),
  respond: ({ text, toolNames }) => {
    const toolName = toolNames.find((name) => /^command[._]/.test(name)) ?? "";
    return { toolCalls: [{ toolName, input: { name: NAMED.exec(text)?.[1] ?? "" } }] };
  },
};

const listEntitiesRule: FakeScenarioRule = {
  id: "data-list-entities",
  matches: ({ text, toolNames }) => modelToolName(toolNames, "catalog.listEntities") !== undefined && /\b(entities|which data)\b/i.test(text),
  respond: ({ toolNames }) => ({ toolCalls: [{ toolName: modelToolName(toolNames, "catalog.listEntities") ?? "catalog.listEntities", input: {} }] }),
};

/** The knowledge agent searches the knowledge base with the request itself (SP3 Task 27 evals). */
const searchKnowledgeRule: FakeScenarioRule = {
  id: "knowledge-search",
  matches: ({ text, toolNames }) => modelToolName(toolNames, "knowledge.searchKnowledge") !== undefined && stripFakeDirectives(text) !== "",
  respond: ({ text, toolNames }) => ({
    toolCalls: [{ toolName: modelToolName(toolNames, "knowledge.searchKnowledge") ?? "knowledge.searchKnowledge", input: { query: stripFakeDirectives(text).slice(0, 1000) } }],
  }),
};

/**
 * Keyword rules of the core agents in fake mode (spec §5.3, SP3 Task 20). The supervisor
 * delegates: a confirmation → `agent-action`, "create a <record>" / data words →
 * `agent-data`, web words → `agent-web`, a question → `agent-knowledge`. The data agent
 * lists entities or renders the form of the command whose target contract matches the
 * word; the action agent runs the first command tool with the quoted name; the
 * knowledge agent searches the knowledge base with the request.
 */
export const coreFakeRules = (commands: readonly FakeCommandRef[]): readonly (readonly [string, FakeScenarioRule])[] => [
  ["assistant", delegation("supervisor-action", "action", CONFIRMED)],
  ["assistant", delegation("supervisor-data", "data", /\b(create|add|new|entities|which data|query)\b/i)],
  ["assistant", delegation("supervisor-web", "web", /\b(web|online|internet)\b/i)],
  ["assistant", delegation("supervisor-knowledge", "knowledge", QUESTION)],
  ["data", renderFormRule(commands)],
  ["data", listEntitiesRule],
  ["action", runCommandRule],
  ["knowledge", searchKnowledgeRule],
];
