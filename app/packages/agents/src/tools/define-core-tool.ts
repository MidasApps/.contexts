import { createHash } from "node:crypto";
import { type AgentRequestContext, PermissionSchema } from "@core/contracts";
import { z } from "zod";
import type { RequestContextReader } from "../context/agent-request-context.ts";
import type { AccessPort, AccessPrincipal, ApprovalPort, AuditPort, CommandIdempotencyPort, NodeRef } from "../runtime/runtime-ports.ts";

/**
 * `defineCoreTool` (spec §8.1, decisions 0019, 0025): the only way the core
 * declares a tool. A definition is plain data validated at boot; the pipeline
 * in `core-tool-pipeline.ts` runs it (strict input, typed context, SP1
 * `authorize()`, approval, audit, timeout, output check) and `tool-registry.ts`
 * turns it into a Mastra tool.
 */

export type CoreToolKind = "read" | "mutation";

/** What a tool's `execute` receives besides its input; everything comes from the server. */
export type CoreToolContext = {
  readonly agent: AgentRequestContext;
  readonly principal: AccessPrincipal;
  readonly node: NodeRef;
  readonly agentId: string;
  readonly toolCallId: string;
  readonly runId: string;
  /** `runId:toolCallId`; a command runs at most once per key (decision 0025). */
  readonly idempotencyKey: string;
  /** Aborted on timeout or when the run is cancelled; pass it to every I/O call. */
  readonly abortSignal: AbortSignal;
};

export type CoreToolPreview = { readonly before: unknown; readonly after: unknown };

export type CoreToolDefinition<TInput extends z.ZodObject = z.ZodObject, TOutput extends z.ZodType = z.ZodType> = {
  /** `<area>.<name>`; command tools are `command.<contractId>`. */
  readonly id: string;
  /** Says WHEN to use the tool; the model routes by it. */
  readonly description: string;
  readonly kind: CoreToolKind;
  /** `<module>.<resource>.<action>`, checked with SP1 `authorize()` on every call. */
  readonly permission: string;
  /** `z.strictObject` with every field `.describe()`d. */
  readonly inputSchema: TInput;
  readonly outputSchema: TOutput;
  // Method syntax on purpose: bivariant parameters let a registry hold tools of different input types.
  execute(input: z.output<TInput>, ctx: CoreToolContext): Promise<z.input<TOutput>>;
  /** Mutation only: before/after shown to approvers. */
  preview?(input: z.output<TInput>, ctx: CoreToolContext): Promise<CoreToolPreview>;
  /** Mutation only: one line for approvers (no secrets). */
  summarize?(input: z.output<TInput>): string;
  /** Command contract id for approval requests; defaults to the id after `command.`. */
  readonly commandId?: string;
  /** Generative UI component id (SP4 registry). */
  readonly ui?: { readonly component: string };
  /**
   * Audit a read tool too (mutations are always audited as `AGENT_TOOL_EXECUTED`).
   * `metadata` adds safe fields of a successful call (ids, fingerprints; never raw input).
   */
  readonly audit?: { readonly action: string; metadata?(output: z.output<TOutput>): Readonly<Record<string, string>> };
  /** Overrides the default timeout (read 15 s, mutation 30 s). */
  readonly timeoutMs?: number;
};

/** Ports and knobs the pipeline needs; bound once per runtime. */
export type CoreToolDeps = {
  readonly access: AccessPort;
  readonly audit: AuditPort;
  readonly approvals: ApprovalPort;
  /** At-most-once mutations per `runId:toolCallId`; without it (unit tests) a mutation runs directly. */
  readonly commands?: CommandIdempotencyPort;
  /** Permission ceiling per agent key; intersected with the context permissions. */
  readonly agentCeilings?: Readonly<Record<string, ReadonlySet<string>>>;
  /**
   * Ceiling decided per run (decision 0046: one registered agent runs every custom agent, so its
   * ceiling depends on the record of the run). Asked first; `undefined` means the static
   * `agentCeilings` entry applies. A rejection fails the call closed.
   */
  readonly runCeilingOf?: (info: { readonly agentId: string; readonly requestContext: RequestContextReader | undefined }) => Promise<ReadonlySet<string> | undefined>;
  /** Timer seam for tests; defaults to `AbortSignal.timeout`. */
  readonly timeoutSignal?: (ms: number) => AbortSignal;
  /** Fallback tool call id outside agent runs; defaults to `crypto.randomUUID`. */
  readonly newCallId?: () => string;
};

/** How Mastra (or a test) invoked the tool. */
export type ToolCallInfo = {
  readonly requestContext: RequestContextReader | undefined;
  readonly agentId: string;
  readonly toolCallId: string;
  /** Workflow run id when a workflow calls the tool; agent runs use the context `requestId`. */
  readonly runId?: string;
  readonly abortSignal?: AbortSignal;
};

export const PendingApprovalResultSchema = z.strictObject({
  status: z.literal("pending-approval"),
  approvalId: z.string().min(1),
});
export type PendingApprovalResult = z.infer<typeof PendingApprovalResultSchema>;

export const DEFAULT_TIMEOUT_MS: Readonly<Record<CoreToolKind, number>> = { read: 15_000, mutation: 30_000 };

const TOOL_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)+$/;

/** Thrown at boot for a malformed definition (bug, never a runtime path). */
export class InvalidToolDefinitionError extends Error {
  readonly code = "INVALID_TOOL_DEFINITION";
  readonly toolId: string;

  constructor(toolId: string, reason: string) {
    super(`tool ${toolId}: ${reason}`);
    this.name = "InvalidToolDefinitionError";
    this.toolId = toolId;
  }
}

const isStrictObject = (schema: z.ZodObject): boolean => schema.def.catchall instanceof z.ZodNever;

const undocumentedFields = (schema: z.ZodObject): string[] =>
  Object.entries(schema.shape)
    .filter(([, field]) => (field as z.ZodType).description === undefined)
    .map(([name]) => name);

const definitionIssues = (definition: CoreToolDefinition): string[] => [
  ...(TOOL_ID_PATTERN.test(definition.id) ? [] : ["id must be <area>.<name>"]),
  ...(definition.description.trim().length >= 10 ? [] : ["description must say when to use the tool"]),
  ...(PermissionSchema.safeParse(definition.permission).success ? [] : ["permission must be <module>.<resource>.<action>"]),
  ...(isStrictObject(definition.inputSchema) ? [] : ["inputSchema must be a z.strictObject"]),
  ...undocumentedFields(definition.inputSchema).map((field) => `input field ${field} needs .describe()`),
  ...(definition.kind === "read" && definition.preview !== undefined ? ["preview is for mutations only"] : []),
];

/**
 * Validates and returns a core tool definition.
 * @throws {InvalidToolDefinitionError} listing every problem (boot error by design).
 */
export const defineCoreTool = <TInput extends z.ZodObject, TOutput extends z.ZodType>(
  definition: CoreToolDefinition<TInput, TOutput>,
): CoreToolDefinition<TInput, TOutput> => {
  const issues = definitionIssues(definition);
  if (issues.length > 0) throw new InvalidToolDefinitionError(definition.id, issues.join("; "));
  return definition;
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

/** Audit-safe fingerprint of a tool input: SHA-256 of canonical JSON (key order ignored). */
export const hashToolInput = (input: unknown): string => `sha256:${createHash("sha256").update(canonicalJson(input)).digest("hex")}`;

