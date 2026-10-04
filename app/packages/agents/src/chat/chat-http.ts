import { type Logger, resolveRequestId } from "@core/services";
import type { Agent } from "@mastra/core/agent";
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, type RequestContext } from "@mastra/core/request-context";
import type { RequestContextReader } from "../context/agent-request-context.ts";
import type { ChatRunOwners } from "./chat-run-owners.ts";
import type { ToolPreviewer } from "./tool-preview.ts";

/** What every chat route needs (built by `composeAgentRuntime`, `RuntimeParts.chat`). */
export type ChatRuntime = {
  /** Public chat agent id (`/chat/:agentId`) → id of its durable wrapper in Mastra. */
  readonly chatAgents: Readonly<Record<string, string>>;
  readonly owners: ChatRunOwners;
  readonly previewer: ToolPreviewer;
  /** Hidden `fast` agent of the summary route (SP4 Task 6). */
  readonly summarizer: Agent;
  /**
   * Custom agents (decision 0046): resolves a chat agent id that is not in `chatAgents` to the
   * durable id that runs it, after loading the caller's tenant's enabled record and naming it in
   * the request context. `undefined` when there is no such agent for the caller.
   */
  readonly resolveCustomAgent?: (
    agentId: string,
    requestContext: RequestContext<unknown>,
  ) => Promise<string | undefined>;
  /**
   * Durable id every custom agent run uses. A run recorded for an agent outside `chatAgents` is a
   * custom agent's, so its owner can still stop it after the agent was disabled or deleted.
   */
  readonly customRunAgentId?: string;
};

/** Mastra id of the durable agent that serves a public chat agent id, for this caller. */
export const durableIdOf = async (
  deps: Pick<ChatRuntime, "chatAgents" | "resolveCustomAgent">,
  agentId: string,
  requestContext: RequestContext<unknown>,
): Promise<string | undefined> =>
  deps.chatAgents[agentId] ?? (await deps.resolveCustomAgent?.(agentId, requestContext));

export type ChatRouteDeps = ChatRuntime & {
  readonly logger: Logger;
  /** Test seam; defaults to `crypto.randomUUID`. */
  readonly newRunId?: () => string;
  /** SSE heartbeat interval; defaults to 15 s (spec §4.2). */
  readonly heartbeatMs?: number;
};

type ErrorCode = "VALIDATION_FAILED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "PAYLOAD_TOO_LARGE" | "INTERNAL_ERROR";

const ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  VALIDATION_FAILED: { status: 400, message: "One or more fields are invalid." },
  FORBIDDEN: { status: 403, message: "Not allowed." },
  NOT_FOUND: { status: 404, message: "Not found." },
  CONFLICT: { status: 409, message: "Nothing to do in the current state." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "The request body is too large." },
  INTERNAL_ERROR: { status: 500, message: "Internal error." },
};

/** Envelope of contracts/api.md §6 (errors before a stream starts). */
export const chatError = (
  code: ErrorCode,
  requestContext: RequestContextReader,
  details?: readonly { field: string; issue: string }[],
): Response =>
  Response.json(
    {
      error: {
        code,
        message: ERRORS[code].message,
        ...(details === undefined ? {} : { details }),
        requestId: requestIdOf(requestContext),
      },
    },
    { status: ERRORS[code].status },
  );

const requestIdOf = (requestContext: RequestContextReader): string => {
  const fromContext = requestContext.get("requestId");
  return typeof fromContext === "string" ? fromContext : resolveRequestId(undefined);
};

/** The caller as the context middleware wrote it: resource `tenantId:uid` and conversation thread. */
export const callerOf = (requestContext: RequestContextReader): { resourceId?: string; threadId?: string } => {
  const resourceId = requestContext.get(MASTRA_RESOURCE_ID_KEY);
  const threadId = requestContext.get(MASTRA_THREAD_ID_KEY);
  return {
    ...(typeof resourceId === "string" && resourceId !== "" ? { resourceId } : {}),
    ...(typeof threadId === "string" && threadId !== "" ? { threadId } : {}),
  };
};

/** 204 for resume or stop of a run that is gone or not the caller's (no existence leak). */
export const noContent = (): Response => new Response(null, { status: 204 });

/**
 * JSON body read with a byte cap (Content-Length may be absent), so an oversized body stops early.
 * @returns the parsed value, `undefined` for a body that is not JSON, or `"too-large"`.
 */
export const readCappedJson = async (request: Request, limit: number): Promise<unknown> => {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > limit) return "too-large";
  if (request.body === null) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request.body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > limit) return "too-large";
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
};
