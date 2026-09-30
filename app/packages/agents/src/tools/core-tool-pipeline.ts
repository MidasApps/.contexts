import { randomUUID } from "node:crypto";
import { AGENT_COMMAND_ACTION_KIND, type AgentApprovalRequest, AgentApprovalRequestSchema } from "@core/contracts";
import { nodeOfContext, readAgentContext } from "../context/agent-request-context.ts";
import {
  type CoreToolContext,
  type CoreToolDefinition,
  type CoreToolDeps,
  DEFAULT_TIMEOUT_MS,
  hashToolInput,
  type PendingApprovalResult,
  type ToolCallInfo,
} from "./define-core-tool.ts";
import { CoreToolError, isCoreToolError } from "./tool-errors.ts";

/** Audit action of every agent mutation (decision 0025); SP1's `AUDIT_ACTIONS` must list it. */
export const AGENT_TOOL_EXECUTED = "AGENT_TOOL_EXECUTED";

type Outcome = "succeeded" | "failed" | "denied" | "pending-approval";
type AuditExtras = Readonly<Record<string, string>>;

const fail = (definition: CoreToolDefinition, code: string, cause?: unknown, details?: CoreToolError["details"]): CoreToolError =>
  new CoreToolError({ code, toolId: definition.id, ...(details === undefined ? {} : { details }) }, cause === undefined ? undefined : { cause });

const parseInput = (definition: CoreToolDefinition, input: unknown): Record<string, unknown> => {
  const parsed = definition.inputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".") || "input"))];
  throw fail(definition, "TOOL_INPUT_INVALID", undefined, { fields });
};

const buildContext = (definition: CoreToolDefinition, deps: CoreToolDeps, call: ToolCallInfo) => {
  const read = readAgentContext(call.requestContext);
  if (!read.ok) throw fail(definition, "CONTEXT_MISSING", undefined, { missing: read.missing });
  const { context, principal } = read.data;
  const toolCallId = call.toolCallId === "" ? (deps.newCallId ?? randomUUID)() : call.toolCallId;
  const runId = call.runId ?? context.requestId;
  return { agent: context, principal, node: nodeOfContext(context), agentId: call.agentId, toolCallId, runId, idempotencyKey: `${runId}:${toolCallId}` };
};

/** Effective ceiling: context permissions (principal ∩ supervisor ceiling) ∩ the calling agent's ceiling. */
const ceilingOf = (deps: CoreToolDeps, ctx: Omit<CoreToolContext, "abortSignal">): ReadonlySet<string> => {
  const agentCeiling = deps.agentCeilings?.[ctx.agentId];
  return new Set(ctx.agent.permissions.filter((permission) => agentCeiling?.has(permission) ?? true));
};

const authorizeCall = async (definition: CoreToolDefinition, deps: CoreToolDeps, ctx: Omit<CoreToolContext, "abortSignal">) => {
  try {
    return await deps.access.authorize({ principal: ctx.principal, permission: definition.permission, node: ctx.node, ceiling: ceilingOf(deps, ctx) });
  } catch (error: unknown) {
    throw fail(definition, "AUTHORIZATION_UNAVAILABLE", error);
  }
};

const shouldAudit = (definition: CoreToolDefinition): boolean => definition.kind === "mutation" || definition.audit !== undefined;

const recordAudit = async (args: {
  definition: CoreToolDefinition;
  deps: CoreToolDeps;
  ctx: Omit<CoreToolContext, "abortSignal">;
  input: Record<string, unknown>;
  outcome: Outcome;
  extras?: AuditExtras;
}): Promise<void> => {
  const { definition, deps, ctx, input, outcome, extras } = args;
  if (!shouldAudit(definition)) return;
  const metadata = { toolId: definition.id, permission: definition.permission, agentId: ctx.agentId, inputHash: hashToolInput(input), outcome, ...extras };
  try {
    await deps.audit.record({ action: definition.audit?.action ?? AGENT_TOOL_EXECUTED, tenantId: ctx.agent.tenantId, actor: ctx.principal, metadata, requestId: ctx.agent.requestId });
  } catch (error: unknown) {
    throw fail(definition, "AUDIT_UNAVAILABLE", error, { outcome });
  }
};

const commandIdOf = (definition: CoreToolDefinition): string =>
  definition.commandId ?? (definition.id.startsWith("command.") ? definition.id.slice("command.".length) : definition.id);

const buildApprovalAction = async (definition: CoreToolDefinition, input: Record<string, unknown>, ctx: CoreToolContext): Promise<AgentApprovalRequest> =>
  AgentApprovalRequestSchema.parse({
    kind: AGENT_COMMAND_ACTION_KIND,
    tenantId: ctx.agent.tenantId,
    requestedBy: ctx.agent.userId,
    agentId: ctx.agentId,
    toolId: definition.id,
    commandId: commandIdOf(definition),
    permission: definition.permission,
    input,
    runId: ctx.runId,
    toolCallId: ctx.toolCallId,
    idempotencyKey: ctx.idempotencyKey,
    summary: definition.summarize?.(input) ?? `Run ${definition.id}`,
    preview: definition.preview === undefined ? null : await definition.preview(input, ctx),
  });

/** Four eyes (decision 0025): an SP1 approval request replaces execution; any failure is fail-closed. */
const requestApproval = async (definition: CoreToolDefinition, deps: CoreToolDeps, input: Record<string, unknown>, ctx: CoreToolContext) => {
  try {
    const action = await buildApprovalAction(definition, input, ctx);
    return await deps.approvals.requestApproval({ principal: ctx.principal, node: ctx.node, permission: definition.permission, action });
  } catch (error: unknown) {
    throw fail(definition, "APPROVAL_UNAVAILABLE", error);
  }
};

/** Runs `execute` under the timeout and the run's abort signal; the combined signal reaches `execute`. */
const executeWithDeadline = async (definition: CoreToolDefinition, deps: CoreToolDeps, input: Record<string, unknown>, ctx: CoreToolContext, parent?: AbortSignal) => {
  const timeout = (deps.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms)))(definition.timeoutMs ?? DEFAULT_TIMEOUT_MS[definition.kind]);
  const signal = AbortSignal.any(parent === undefined ? [timeout] : [timeout, parent]);
  const stopped = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(fail(definition, timeout.aborted ? "TOOL_TIMEOUT" : "TOOL_ABORTED", signal.reason));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([definition.execute(input, { ...ctx, abortSignal: signal }), stopped]);
  } catch (error: unknown) {
    throw isCoreToolError(error) ? error : fail(definition, "TOOL_FAILED", error);
  }
};

const parseOutput = (definition: CoreToolDefinition, output: unknown): unknown => {
  const parsed = definition.outputSchema.safeParse(output);
  if (!parsed.success) throw fail(definition, "TOOL_OUTPUT_INVALID", parsed.error);
  return parsed.data;
};

const executeAndAudit = async (definition: CoreToolDefinition, deps: CoreToolDeps, input: Record<string, unknown>, ctx: CoreToolContext, parent?: AbortSignal) => {
  try {
    const output = parseOutput(definition, await executeWithDeadline(definition, deps, input, ctx, parent));
    await recordAudit({ definition, deps, ctx, input, outcome: "succeeded" });
    return output;
  } catch (error: unknown) {
    if (isCoreToolError(error) && error.code !== "AUDIT_UNAVAILABLE") {
      await recordAudit({ definition, deps, ctx, input, outcome: "failed", extras: { errorCode: error.code } });
    }
    throw error;
  }
};

/**
 * Runs a core tool call: strict input → typed context (no default tenant) →
 * SP1 `authorize()` with the agent ceiling → approval request when SP1 requires
 * it (mutations) → execute under timeout/abort → output check → audit.
 * @throws {CoreToolError} with a stable code; nothing runs after a failed check.
 */
export const runCoreTool = async (definition: CoreToolDefinition, deps: CoreToolDeps, rawInput: unknown, call: ToolCallInfo): Promise<unknown> => {
  const input = parseInput(definition, rawInput);
  const base = buildContext(definition, deps, call);
  const decision = await authorizeCall(definition, deps, base);
  if (!decision.allowed) {
    await recordAudit({ definition, deps, ctx: base, input, outcome: "denied", extras: { errorCode: "FORBIDDEN", reason: decision.reason } });
    throw fail(definition, "FORBIDDEN", undefined, { reason: decision.reason });
  }
  const ctx: CoreToolContext = { ...base, abortSignal: call.abortSignal ?? new AbortController().signal };
  if (definition.kind === "mutation" && decision.requiresApproval) {
    const { approvalId } = await requestApproval(definition, deps, input, ctx);
    await recordAudit({ definition, deps, ctx: base, input, outcome: "pending-approval", extras: { approvalId } });
    return { status: "pending-approval", approvalId } satisfies PendingApprovalResult;
  }
  return executeAndAudit(definition, deps, input, ctx, call.abortSignal);
};
