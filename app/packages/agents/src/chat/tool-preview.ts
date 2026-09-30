import { processLogger } from "@core/services";
import type { UIMessageChunk } from "ai";
import type { RequestContextReader } from "../context/agent-request-context.ts";
import { previewCoreToolCall } from "../tools/core-tool-pipeline.ts";
import type { CoreToolDeps, CoreToolPreview } from "../tools/define-core-tool.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import type { ChatRunState } from "./chat-run-owners.ts";

/**
 * `data-tool-preview` (SP4 spec §4.4, decision 0032): what the approval card shows next to
 * Mastra's `data-tool-call-approval` — the core tool behind the sanitized stream name, its
 * permission, a one-line summary and the before/after of its `preview`.
 */
export type ToolPreviewData = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly toolId?: string;
  readonly permission?: string;
  readonly summary?: string;
  readonly preview: CoreToolPreview | null;
};

export type ToolPreviewer = {
  /** Never throws: an unknown tool or a failing preview gives a smaller preview. */
  readonly describe: (call: { toolName: string; toolCallId: string; args: unknown; requestContext: RequestContextReader }) => Promise<ToolPreviewData>;
};

/** Mastra sends tool ids to the model (and the stream) with every other character replaced by `_`. */
const sanitizedToolName = (toolId: string): string => toolId.replace(/[^A-Za-z0-9_-]/g, "_");

export const createToolPreviewer = (deps: { readonly tools: ToolRegistry; readonly toolDeps: CoreToolDeps }): ToolPreviewer => ({
  describe: async ({ toolName, toolCallId, args, requestContext }) => {
    const toolId = deps.tools.ids().find((id) => id === toolName || sanitizedToolName(id) === toolName);
    const definition = toolId === undefined ? undefined : deps.tools.get(toolId);
    if (definition === undefined) return { toolCallId, toolName, preview: null };
    const known = { toolCallId, toolName, toolId: definition.id, permission: definition.permission };
    try {
      const { summary, preview } = await previewCoreToolCall(definition, deps.toolDeps, args, { requestContext, agentId: "", toolCallId });
      return { ...known, summary, preview };
    } catch (error: unknown) {
      processLogger.warn("chat_tool_preview_failed", { toolId: definition.id, err: error });
      return { ...known, preview: null };
    }
  },
});

type ApprovalData = { readonly toolCallId?: unknown; readonly toolName?: unknown; readonly args?: unknown };

const approvalDataOf = (chunk: UIMessageChunk): ApprovalData | undefined =>
  chunk.type === "data-tool-call-approval" ? ((chunk as { data?: ApprovalData }).data ?? undefined) : undefined;

/**
 * Pass-through transform of a chat stream: after each `data-tool-call-approval` it writes the
 * `data-tool-preview` of the same tool call, and it reports the run state (`suspended` at an
 * approval request, else `finished` at the end).
 */
export const createChatStreamTap = (args: {
  readonly previewer: ToolPreviewer;
  readonly requestContext: RequestContextReader;
  readonly onState: (state: ChatRunState) => void;
}): TransformStream<UIMessageChunk, UIMessageChunk> => {
  let suspended = false;
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform: async (chunk, controller) => {
      controller.enqueue(chunk);
      if (chunk.type === "tool-approval-request") suspended = true;
      const approval = approvalDataOf(chunk);
      if (approval === undefined || typeof approval.toolCallId !== "string" || typeof approval.toolName !== "string") return;
      const data = await args.previewer.describe({ toolName: approval.toolName, toolCallId: approval.toolCallId, args: approval.args, requestContext: args.requestContext });
      controller.enqueue({ type: "data-tool-preview", id: approval.toolCallId, data });
    },
    flush: () => args.onState(suspended ? "suspended" : "finished"),
  });
};
