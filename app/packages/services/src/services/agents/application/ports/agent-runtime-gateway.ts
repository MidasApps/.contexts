import type { RegionalSettings } from "@core/contracts";

/**
 * Driven port of `/v1` to the private agent runtime (SP3 spec §4.1, umbrella
 * §16.3). Use cases (chat, knowledge, MCP, approvals) call it; the Mastra
 * adapter is its only implementation. Nothing a client sends reaches Mastra
 * except the fields named here.
 */

/** Who calls and where: resolved by `/v1` (SP1 `resolveAccessContext`), never read from a request body. */
export type AgentCallScope = {
  /** The caller's own credential (Firebase ID token or API key), forwarded as `Authorization: Bearer`. */
  readonly bearer: string;
  readonly tenantId: string;
  readonly projectId?: string;
  readonly unitId?: string;
  readonly regional: RegionalSettings;
  /** Route id of the UI screen (≤ 200 chars). */
  readonly activeScreen?: string;
  /** Chat conversation; Mastra binds the memory thread to it. */
  readonly conversationId?: string;
  /** `X-Request-Id` (ULID); also the agent `runId`, so tool idempotency keys match (decision 0025). */
  readonly requestId: string;
  /** W3C trace context of the `/v1` request. */
  readonly traceparent?: string;
  /** Aborts the upstream call when the `/v1` client goes away. */
  readonly signal?: AbortSignal;
};

/** Codes of `contracts/api.md` §6 the gateway answers with; the Mastra body never passes through. */
export type GatewayErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE";

export type GatewayError = {
  readonly code: GatewayErrorCode;
  /** HTTP status for `/v1`: 401, 403, 404, 400, 409, 429, 502 or 504 (timeout). */
  readonly status: number;
  /** From Mastra's `Retry-After` on 429, when numeric. */
  readonly retryAfterSeconds?: number;
};

export type GatewayResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: GatewayError };

/** An upstream stream handed to `/v1` as is (SSE or chunked JSON). */
export type GatewayStream = {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
  /** Conversation Mastra created because the call named none (`X-Conversation-Id` of the answer, follow-up #24). */
  readonly conversationId?: string;
};

/**
 * Run options forwarded to Mastra (`maxSteps`, `toolChoice`, ...). `requestContext`,
 * `runId`, `resourceId` and `threadId` are always removed: Mastra builds them server-side.
 */
export type AgentRunOptions = Readonly<Record<string, unknown>>;

/** A plain text turn; richer parts (files, tool results) are added by the chat task (SP4). */
export type AgentMessage = { role: "user" | "assistant" | "system"; content: string };

export type AgentRunInput = {
  readonly scope: AgentCallScope;
  readonly agentId: string;
  readonly messages: string | AgentMessage[];
  readonly options?: AgentRunOptions;
};

export type ToolCallDecisionInput = {
  readonly scope: AgentCallScope;
  readonly agentId: string;
  /** Run that suspended on the tool call (the `requestId` of the call that started it). */
  readonly runId: string;
  readonly toolCallId: string;
};

export type WorkflowStartInput = {
  readonly scope: AgentCallScope;
  readonly workflowId: string;
  readonly inputData: Readonly<Record<string, unknown>>;
  /** Defaults to a run id Mastra assigns. */
  readonly runId?: string;
};

export type WorkflowResumeInput = {
  readonly scope: AgentCallScope;
  readonly workflowId: string;
  readonly runId: string;
  readonly step?: string | readonly string[];
  readonly resumeData: unknown;
};

export type ThreadInput = { readonly scope: AgentCallScope; readonly agentId: string; readonly threadId: string };

export type AgentRuntimeGateway = {
  readonly generate: (input: AgentRunInput) => Promise<GatewayResult<unknown>>;
  readonly stream: (input: AgentRunInput) => Promise<GatewayResult<GatewayStream>>;
  readonly approveToolCall: (input: ToolCallDecisionInput) => Promise<GatewayResult<GatewayStream>>;
  readonly declineToolCall: (input: ToolCallDecisionInput & { readonly reason?: string }) => Promise<GatewayResult<GatewayStream>>;
  readonly startWorkflow: (input: WorkflowStartInput) => Promise<GatewayResult<{ readonly runId: string; readonly result: unknown }>>;
  /** Starts a run without waiting for it (`202` routes such as `POST .../knowledge/sources`). */
  readonly launchWorkflow: (input: WorkflowStartInput) => Promise<GatewayResult<{ readonly runId: string }>>;
  readonly resumeWorkflow: (input: WorkflowResumeInput) => Promise<GatewayResult<unknown>>;
  readonly streamWorkflow: (input: WorkflowStartInput) => Promise<GatewayResult<GatewayStream>>;
  readonly listThreadMessages: (input: ThreadInput) => Promise<GatewayResult<unknown>>;
  readonly deleteThread: (input: ThreadInput) => Promise<GatewayResult<null>>;
  /** MCP Streamable HTTP message to a Mastra MCP server (`/api/mcp/<serverId>/mcp`). */
  readonly callMcp: (input: { readonly scope: AgentCallScope; readonly serverId: string; readonly body: unknown }) => Promise<GatewayResult<GatewayStream>>;
};
