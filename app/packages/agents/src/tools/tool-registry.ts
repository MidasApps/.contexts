import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runCoreTool } from "./core-tool-pipeline.ts";
import { type CoreToolDefinition, type CoreToolDeps, PendingApprovalResultSchema, type ToolCallInfo } from "./define-core-tool.ts";
import { CoreToolError } from "./tool-errors.ts";

/** Execution context fields the binding reads from Mastra (agent, workflow or MCP call). */
type MastraToolCallContext = {
  readonly requestContext?: { readonly get: (key: string) => unknown };
  readonly abortSignal?: AbortSignal;
  readonly agent?: { readonly agentId?: string; readonly toolCallId?: string };
  readonly workflow?: { readonly runId?: string };
};

/** A Mastra tool built from a core definition; the registry keeps the definition beside it. */
export type BoundCoreTool = ReturnType<typeof bindCoreTool>;

const toCallInfo = (ctx: MastraToolCallContext | undefined, fixedAgentId?: string): ToolCallInfo => ({
  requestContext: ctx?.requestContext,
  agentId: fixedAgentId ?? ctx?.agent?.agentId ?? "",
  toolCallId: ctx?.agent?.toolCallId ?? "",
  ...(ctx?.workflow?.runId === undefined ? {} : { runId: ctx.workflow.runId }),
  ...(ctx?.abortSignal === undefined ? {} : { abortSignal: ctx.abortSignal }),
});

/**
 * Mastra tool for a core definition. Mutations always need user confirmation
 * (`requireApproval: true`, decision 0025) and may also return the pending
 * approval result, so their output schema accepts it.
 * @param options.agentId caller key for the ceiling when no agent runs the tool (the core MCP server).
 */
export const bindCoreTool = (definition: CoreToolDefinition, deps: CoreToolDeps, options: { readonly agentId?: string } = {}) =>
  createTool({
    id: definition.id,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.kind === "mutation" ? z.union([definition.outputSchema, PendingApprovalResultSchema]) : definition.outputSchema,
    requireApproval: definition.kind === "mutation",
    strict: true,
    execute: (input, ctx) => runCoreTool(definition, deps, input, toCallInfo(ctx as MastraToolCallContext, options.agentId)),
  });

export type ToolRegistry = {
  /** @throws {DuplicateToolError} when the id is taken (boot error). */
  readonly register: (definition: CoreToolDefinition) => void;
  readonly has: (id: string) => boolean;
  readonly get: (id: string) => CoreToolDefinition | undefined;
  readonly ids: () => readonly string[];
  /**
   * Mastra tools keyed by tool id (the stream's tool name is the key).
   * @throws {CoreToolError} `TOOL_NOT_FOUND` for an unknown id (fail at composition, not at run time).
   */
  readonly toMastraTools: (ids: readonly string[]) => Record<string, BoundCoreTool>;
};

export class DuplicateToolError extends Error {
  readonly code = "DUPLICATE_TOOL";
  readonly toolId: string;

  constructor(toolId: string) {
    super(`tool ${toolId} is already registered`);
    this.name = "DuplicateToolError";
    this.toolId = toolId;
  }
}

/** Registry of core and module tools, bound to the runtime ports once (spec §3.1, decision 0019). */
export const createToolRegistry = (deps: CoreToolDeps): ToolRegistry => {
  const definitions = new Map<string, CoreToolDefinition>();
  const bound = new Map<string, BoundCoreTool>();
  const boundTool = (id: string): BoundCoreTool => {
    const definition = definitions.get(id);
    if (definition === undefined) throw new CoreToolError({ code: "TOOL_NOT_FOUND", toolId: id });
    const tool = bound.get(id) ?? bindCoreTool(definition, deps);
    bound.set(id, tool);
    return tool;
  };
  return {
    register: (definition) => {
      if (definitions.has(definition.id)) throw new DuplicateToolError(definition.id);
      definitions.set(definition.id, definition);
    },
    has: (id) => definitions.has(id),
    get: (id) => definitions.get(id),
    ids: () => [...definitions.keys()],
    toMastraTools: (ids) => Object.fromEntries(ids.map((id) => [id, boundTool(id)])),
  };
};
