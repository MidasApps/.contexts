import { toAISdkStream, withSseHeartbeat } from "@mastra/ai-sdk";
import type { DurableAgent } from "@mastra/core/agent/durable";
import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { callerOf, chatError, type ChatRouteDeps, noContent } from "./chat-http.ts";

/**
 * A durable run whose process died never publishes `finish`; the observe stream ends after this
 * much silence unless the run is still known to be running here.
 */
export const OBSERVE_IDLE_TIMEOUT_MS = 30_000;
const HEARTBEAT_MS = 15_000;

export type ObserveInput = { readonly agentId: string; readonly runId: string; readonly requestContext: RequestContext<unknown>; readonly mastra: Mastra };

/**
 * `GET /chat/:agentId/runs/:runId/observe` (decision 0031): replays the caller's run from its
 * `start` through the durable agent's cache and follows it live. 204 when the run is unknown
 * here, belongs to someone else, or waits for an approval (nothing streams until it is answered).
 */
export const handleObserve = async (input: ObserveInput, deps: ChatRouteDeps): Promise<Response> => {
  const durableId = deps.chatAgents[input.agentId];
  if (durableId === undefined) return chatError("NOT_FOUND", input.requestContext);
  const { resourceId, threadId } = callerOf(input.requestContext);
  if (resourceId === undefined || threadId === undefined || !deps.owners.isOwnedBy(input.runId, { resourceId, threadId })) return noContent();
  if (deps.owners.ownerOf(input.runId)?.state === "suspended") return noContent();
  const agent = input.mastra.getAgentById(durableId) as unknown as DurableAgent;
  const observed = await agent.observe(input.runId, {
    idleTimeoutMs: OBSERVE_IDLE_TIMEOUT_MS,
    isAlive: () => deps.owners.ownerOf(input.runId)?.state === "running",
  });
  // Same conversion `handleChatStream` applies to a live run (v7 parts, reasoning and sources).
  const stream = toAISdkStream(observed as never, { from: "agent", version: "v7", sendReasoning: true, sendSources: true }) as ReadableStream<UIMessageChunk>;
  const response = createUIMessageStreamResponse({ stream, headers: { "x-run-id": input.runId } });
  return withSseHeartbeat(response, deps.heartbeatMs ?? HEARTBEAT_MS);
};
