import { z } from "zod";

/**
 * Read-only view of an agent run as `runEvals` hands it to `type: "agent"` scorers
 * (`run.output`: Mastra DB messages). Shapes are parsed loosely (`looseObject`):
 * the scorers read a few fields of a Mastra-owned format and ignore the rest.
 */

const ToolInvocationSchema = z.looseObject({
  state: z.string().optional(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  args: z.unknown().optional(),
  result: z.unknown().optional(),
});

const PartSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  toolInvocation: ToolInvocationSchema.optional(),
});

const MessageSchema = z.looseObject({
  role: z.string(),
  content: z.union([
    z.string(),
    z.looseObject({ parts: z.array(PartSchema).optional(), metadata: z.record(z.string(), z.unknown()).optional() }),
  ]),
});

export type ToolCallView = {
  readonly toolName: string;
  /** `result` after execution, `call` while awaiting approval. */
  readonly state: string;
  readonly result: unknown;
  /** Tool calls a subagent made inside this delegation (`agent-<key>` tools). */
  readonly nested: readonly ToolCallView[];
};

export type AgentRunView = {
  /** Final answer text: the text parts of the assistant messages, joined. */
  readonly answer: string;
  readonly toolCalls: readonly ToolCallView[];
  /** A tool call awaits the user's approval (the run is suspended). */
  readonly pendingApproval: boolean;
};

const NestedResultSchema = z.looseObject({ toolName: z.string().optional(), result: z.unknown().optional() });
const DelegationResultSchema = z.looseObject({ subAgentToolResults: z.array(z.unknown()).optional() });

const nestedCallsOf = (result: unknown): ToolCallView[] => {
  const parsed = DelegationResultSchema.safeParse(result);
  if (!parsed.success) return [];
  return (parsed.data.subAgentToolResults ?? []).flatMap((entry) => {
    const nested = NestedResultSchema.safeParse(entry);
    return nested.success && nested.data.toolName !== undefined
      ? [{ toolName: nested.data.toolName, state: "result", result: nested.data.result, nested: [] }]
      : [];
  });
};

// A delegation suspended by its subagent's approval: `suspendedTools[callId].suspendPayload.toolName`.
const SuspendedToolsSchema = z.record(
  z.string(),
  z.looseObject({ suspendPayload: z.looseObject({ toolName: z.string().optional() }).optional() }),
);

const suspendedCallsOf = (metadata: Record<string, unknown> | undefined): Map<string, string> => {
  const parsed = SuspendedToolsSchema.safeParse(metadata?.["suspendedTools"] ?? {});
  if (!parsed.success) return new Map();
  return new Map(
    Object.entries(parsed.data).flatMap(([callId, entry]) =>
      entry.suspendPayload?.toolName === undefined ? [] : [[callId, entry.suspendPayload.toolName] as const],
    ),
  );
};

const isAwaitingApproval = (metadata: Record<string, unknown> | undefined): boolean =>
  metadata?.["pendingToolApprovals"] !== undefined || metadata?.["suspendedTools"] !== undefined;

const messagesOf = (output: unknown): z.infer<typeof MessageSchema>[] => {
  const parsed = z.array(z.unknown()).safeParse(output);
  if (!parsed.success) return [];
  return parsed.data.flatMap((message) => {
    const result = MessageSchema.safeParse(message);
    return result.success && result.data.role === "assistant" ? [result.data] : [];
  });
};

/** Builds the view; unknown shapes give an empty view (the scorers then score 0 or not scorable). */
export const viewAgentRun = (output: unknown): AgentRunView => {
  const texts: string[] = [];
  const toolCalls: ToolCallView[] = [];
  let pendingApproval = false;
  for (const message of messagesOf(output)) {
    if (typeof message.content === "string") {
      texts.push(message.content);
      continue;
    }
    const { metadata } = message.content;
    if (isAwaitingApproval(metadata)) pendingApproval = true;
    const suspended = suspendedCallsOf(metadata);
    for (const part of message.content.parts ?? []) {
      if (part.type === "text" && part.text !== undefined) texts.push(part.text);
      const invocation = part.toolInvocation;
      if (part.type === "tool-invocation" && invocation !== undefined) {
        const waiting = suspended.get(invocation.toolCallId ?? "");
        const nested = [
          ...nestedCallsOf(invocation.result),
          ...(waiting === undefined ? [] : [{ toolName: waiting, state: "call", result: undefined, nested: [] }]),
        ];
        toolCalls.push({
          toolName: invocation.toolName,
          state: invocation.state ?? "result",
          result: invocation.result,
          nested,
        });
      }
    }
  }
  return { answer: texts.join("\n").trim(), toolCalls, pendingApproval };
};

/** Every tool call of the run, delegations first, then the subagents' calls. */
export const allToolCalls = (view: AgentRunView): ToolCallView[] =>
  view.toolCalls.flatMap((call) => [call, ...call.nested]);

/** Mastra sends tool names to the model sanitized (`catalog.listEntities` → `catalog_listEntities`). */
export const sanitizeToolName = (name: string): string => name.replace(/[^A-Za-z0-9_-]/g, "_");

/**
 * Whether a called tool matches an expected name: equal once sanitized, or a prefix
 * pattern ending in `*` (`command.*` matches `command_tenancy_CreateProjectInput`).
 */
export const toolNameMatches = (called: string, pattern: string): boolean => {
  const name = sanitizeToolName(called);
  if (pattern.endsWith("*")) return name.startsWith(sanitizeToolName(pattern.slice(0, -1)));
  return name === sanitizeToolName(pattern);
};
