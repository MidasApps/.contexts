import { toAISdkStream, withSseHeartbeat } from "@mastra/ai-sdk";
import type { DurableAgent } from "@mastra/core/agent/durable";
import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { callerOf, chatError, type ChatRouteDeps, durableIdOf, noContent } from "./chat-http.ts";
import { createChatStreamTap } from "./tool-preview.ts";

/**
 * A durable run whose process died never publishes `finish`; the observe stream ends after this
 * much silence unless the run is still in this process's run registry.
 */
export const OBSERVE_IDLE_TIMEOUT_MS = 30_000;
const HEARTBEAT_MS = 15_000;

export type ObserveInput = { readonly agentId: string; readonly runId: string; readonly requestContext: RequestContext<unknown>; readonly mastra: Mastra };

/**
 * `GET /chat/:agentId/runs/:runId/observe` (decision 0031): replays the caller's run from its
 * `start` through the durable agent's cache and follows it live. 204 when the run is not the
 * caller's, is no longer in this process's run registry (finished and cleaned up, or run by
 * another instance), or already waits for an approval. A replay that reaches an approval request
 * ends there (the stream closes after the approval and its preview) and marks the run suspended,
 * even when the client that started it had disconnected before.
 */
export const handleObserve = async (input: ObserveInput, deps: ChatRouteDeps): Promise<Response> => {
  const durableId = await durableIdOf(deps, input.agentId, input.requestContext);
  if (durableId === undefined) return chatError("NOT_FOUND", input.requestContext);
  const { resourceId, threadId } = callerOf(input.requestContext);
  if (resourceId === undefined || threadId === undefined || !deps.owners.isOwnedBy(input.runId, { resourceId, threadId })) return noContent();
  if (deps.owners.ownerOf(input.runId)?.state === "suspended") return noContent();
  const agent = input.mastra.getAgentById(durableId) as unknown as DurableAgent;
  if (!agent.runRegistry.has(input.runId)) return noContent();
  const observed = await agent.observe(input.runId, {
    idleTimeoutMs: OBSERVE_IDLE_TIMEOUT_MS,
    isAlive: () => agent.runRegistry.has(input.runId),
  });
  // Same conversion `handleChatStream` applies to a live run (v7 parts, reasoning and sources).
  const converted = toAISdkStream(observed as never, { from: "agent", version: "v7", sendReasoning: true, sendSources: true }) as ReadableStream<UIMessageChunk>;
  const tap = createChatStreamTap({
    previewer: deps.previewer,
    requestContext: input.requestContext,
    onState: (state) => deps.owners.markState(input.runId, state),
    closeAtSuspension: true,
  });
  const response = createUIMessageStreamResponse({ stream: converted.pipeThrough(tap), headers: { "x-run-id": input.runId } });
  return withSseHeartbeat(response, deps.heartbeatMs ?? HEARTBEAT_MS);
};
