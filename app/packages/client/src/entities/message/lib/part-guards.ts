import type { UIMessage } from "ai";
import type { ToolState } from "#/shared/ui/ai/tool.tsx";

// Readers over the loose parts of a chat message. The stream is model- and server-written JSON:
// every reader checks the shape it needs and answers `null` instead of trusting a cast, so an
// unexpected part degrades to "not rendered", never to a crash (decision 0032).

export type LoosePart = { readonly type: string; readonly [key: string]: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const stringOf = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

const TOOL_STATES: ReadonlySet<string> = new Set<ToolState>([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  "output-denied",
]);

export type ToolApprovalView = { readonly id: string; readonly approved?: boolean | undefined; readonly reason?: string | undefined };

/** A `tool-<name>` or `dynamic-tool` part, normalized. */
export type ToolPartView = {
  readonly type: string;
  /** Sanitized tool name as the stream carries it (`agent-knowledge`, `catalog_renderForm`). */
  readonly toolName: string;
  readonly toolCallId: string;
  readonly state: ToolState;
  readonly input: unknown;
  readonly output: unknown;
  readonly errorText: string | undefined;
  readonly approval: ToolApprovalView | undefined;
};

const approvalOf = (value: unknown): ToolApprovalView | undefined => {
  if (!isRecord(value) || typeof value["id"] !== "string") return undefined;
  return {
    id: value["id"],
    ...(typeof value["approved"] === "boolean" ? { approved: value["approved"] } : {}),
    ...(typeof value["reason"] === "string" ? { reason: value["reason"] } : {}),
  };
};

export const toolPartOf = (part: LoosePart): ToolPartView | null => {
  const toolName = part.type === "dynamic-tool" ? stringOf(part["toolName"]) : part.type.startsWith("tool-") ? part.type.slice("tool-".length) : undefined;
  const toolCallId = stringOf(part["toolCallId"]);
  const state = part["state"];
  if (toolName === undefined || toolName === "" || toolCallId === undefined || typeof state !== "string" || !TOOL_STATES.has(state)) return null;
  return {
    type: part.type,
    toolName,
    toolCallId,
    state: state as ToolState,
    input: part["input"],
    output: part["output"],
    errorText: stringOf(part["errorText"]),
    approval: approvalOf(part["approval"]),
  };
};

/** One tool call a subagent made while handling a delegation. */
export type DelegationStep = { readonly toolName: string; readonly toolCallId: string; readonly result: unknown; readonly args: unknown; readonly isError: boolean };

/** The supervisor handing the request to a subagent (`tool-agent-<id>`, spike report SP4 Task 1). */
export type DelegationView = {
  readonly agentId: string;
  readonly prompt: string | undefined;
  /** What the subagent answered; the supervisor usually rewrites it in its own text. */
  readonly text: string | undefined;
  readonly steps: readonly DelegationStep[];
};

const stepOf = (value: unknown): DelegationStep | null => {
  if (!isRecord(value) || typeof value["toolName"] !== "string" || typeof value["toolCallId"] !== "string") return null;
  return { toolName: value["toolName"], toolCallId: value["toolCallId"], result: value["result"], args: value["args"], isError: value["isError"] === true };
};

const AGENT_PREFIX = "agent-";

export const delegationOf = (tool: ToolPartView): DelegationView | null => {
  if (!tool.toolName.startsWith(AGENT_PREFIX) || tool.toolName.length === AGENT_PREFIX.length) return null;
  const output = isRecord(tool.output) ? tool.output : {};
  const results = Array.isArray(output["subAgentToolResults"]) ? output["subAgentToolResults"] : [];
  return {
    agentId: tool.toolName.slice(AGENT_PREFIX.length),
    prompt: isRecord(tool.input) ? stringOf(tool.input["prompt"]) : undefined,
    text: stringOf(output["text"]),
    steps: results.map(stepOf).filter((step): step is DelegationStep => step !== null),
  };
};

/** `data-tripwire`: a processor stopped the run (budget, PII, injection…). */
export type TripwireView = { readonly processorId: string | undefined; readonly reason: string | undefined };

export const tripwireOf = (part: LoosePart): TripwireView | null => {
  if (part.type !== "data-tripwire") return null;
  const data = isRecord(part["data"]) ? part["data"] : {};
  const metadata = isRecord(data["metadata"]) ? data["metadata"] : {};
  return { processorId: stringOf(data["processorId"]) ?? stringOf(metadata["processorId"]), reason: stringOf(data["reason"]) };
};

/** `data-tool-preview` (decision 0032): what an approval card shows about the pending call. */
export type ToolPreviewView = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly toolId: string | undefined;
  readonly permission: string | undefined;
  readonly summary: string | undefined;
  readonly preview: { readonly before: unknown; readonly after: unknown } | null;
};

export const toolPreviewOf = (part: LoosePart): ToolPreviewView | null => {
  if (part.type !== "data-tool-preview" || !isRecord(part["data"])) return null;
  const data = part["data"];
  const toolCallId = stringOf(data["toolCallId"]);
  const toolName = stringOf(data["toolName"]);
  if (toolCallId === undefined || toolName === undefined) return null;
  const preview = isRecord(data["preview"]) ? { before: data["preview"]["before"], after: data["preview"]["after"] } : null;
  return { toolCallId, toolName, toolId: stringOf(data["toolId"]), permission: stringOf(data["permission"]), summary: stringOf(data["summary"]), preview };
};

/** `data-tool-call-approval`: the sanitized name and arguments of the call waiting for approval. */
export type ApprovalRequestView = { readonly toolCallId: string; readonly toolName: string; readonly args: unknown };

export const approvalRequestOf = (part: LoosePart): ApprovalRequestView | null => {
  if (part.type !== "data-tool-call-approval" || !isRecord(part["data"])) return null;
  const toolCallId = stringOf(part["data"]["toolCallId"]);
  const toolName = stringOf(part["data"]["toolName"]);
  return toolCallId === undefined || toolName === undefined ? null : { toolCallId, toolName, args: part["data"]["args"] };
};

/** A tool output that asks for a generative UI component (`{ ui: { component, props } }`). */
export type GenerativeUiView = { readonly component: string; readonly props: unknown };

export const generativeUiOf = (value: unknown): GenerativeUiView | null => {
  if (!isRecord(value) || !isRecord(value["ui"])) return null;
  const component = stringOf(value["ui"]["component"]);
  return component === undefined ? null : { component, props: value["ui"]["props"] };
};

/** A four-eyes command waiting for another member (`{ status: "pending-approval", approvalId }`). */
export const pendingApprovalOf = (value: unknown): { readonly approvalId: string } | null => {
  if (!isRecord(value) || value["status"] !== "pending-approval") return null;
  const approvalId = stringOf(value["approvalId"]);
  return approvalId === undefined ? null : { approvalId };
};

export const partsOf = (message: UIMessage): readonly LoosePart[] => message.parts;

/**
 * `confidence: "low"` of the citation guard (SP3). Read leniently: the guard writes
 * `low | grounded` while `MessageMetadataSchema` names `low | normal`; only `low` matters here.
 */
export const isLowConfidence = (message: UIMessage): boolean => isRecord(message.metadata) && message.metadata["confidence"] === "low";

export type AttachmentView = { readonly fileId: string; readonly name: string; readonly mediaType: string; readonly sizeBytes: number | undefined };

/** Attachments of a user message, from its metadata (history) — never from client URLs. */
export const attachmentsOf = (message: UIMessage): readonly AttachmentView[] => {
  const list = isRecord(message.metadata) && Array.isArray(message.metadata["attachments"]) ? message.metadata["attachments"] : [];
  return list.flatMap((item: unknown) => {
    if (!isRecord(item)) return [];
    const fileId = stringOf(item["fileId"]);
    const name = stringOf(item["name"]);
    if (fileId === undefined || name === undefined) return [];
    return [{ fileId, name, mediaType: stringOf(item["mediaType"]) ?? "application/octet-stream", sizeBytes: typeof item["sizeBytes"] === "number" ? item["sizeBytes"] : undefined }];
  });
};

/** The visible text of a message (copy action, form-submission detection). */
export const textOf = (message: UIMessage): string =>
  partsOf(message)
    .flatMap((part) => (part.type === "text" && typeof part["text"] === "string" ? [part["text"]] : []))
    .join("\n\n");

/** Something an answer can cite: a knowledge passage or a source part of the stream. */
export type SourceView = { readonly id: string; readonly title: string | undefined; readonly url: string | undefined; readonly snippet: string | undefined };

const citationOf = (value: unknown): SourceView | null => {
  if (!isRecord(value) || typeof value["citationId"] !== "string") return null;
  return { id: value["citationId"].toLowerCase(), title: stringOf(value["title"]), url: stringOf(value["sourceUrl"]), snippet: stringOf(value["snippet"]) };
};

const citationsIn = (output: unknown): SourceView[] => {
  if (!isRecord(output) || !Array.isArray(output["results"])) return [];
  return output["results"].map(citationOf).filter((source): source is SourceView => source !== null);
};

const sourcePartOf = (part: LoosePart): SourceView | null => {
  if (part.type !== "source-url" && part.type !== "source-document") return null;
  const id = stringOf(part["sourceId"]);
  return id === undefined ? null : { id: id.toLowerCase(), title: stringOf(part["title"]), url: stringOf(part["url"]), snippet: undefined };
};

/**
 * Every source of a message, by id: `source-*` parts plus the passages knowledge search
 * returned, whether the supervisor called the tool or a subagent did (`subAgentToolResults`).
 */
export const collectSources = (parts: readonly LoosePart[]): ReadonlyMap<string, SourceView> => {
  const sources = new Map<string, SourceView>();
  const add = (source: SourceView | null) => {
    if (source !== null && !sources.has(source.id)) sources.set(source.id, source);
  };
  for (const part of parts) {
    add(sourcePartOf(part));
    const tool = toolPartOf(part);
    if (tool === null) continue;
    citationsIn(tool.output).forEach(add);
    delegationOf(tool)?.steps.forEach((step) => citationsIn(step.result).forEach(add));
  }
  return sources;
};
