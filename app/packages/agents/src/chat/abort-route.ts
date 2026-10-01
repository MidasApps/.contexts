import { type DurableAgent, publishAbortRequest } from "@mastra/core/agent/durable";
import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import { callerOf, type ChatRouteDeps, durableIdOf, noContent } from "./chat-http.ts";

export type AbortInput = { readonly runId: string; readonly requestContext: RequestContext<unknown>; readonly mastra: Mastra };

/**
 * `POST /chat/runs/:runId/abort` (decision 0031): asks whichever process drives the caller's run
 * to stop it (`publishAbortRequest` over the agent's PubSub). The run ends with a normal `finish`
 * and memory keeps the partial answer. Always 204: an unknown, finished or foreign run is a no-op.
 */
export const handleAbort = async (input: AbortInput, deps: ChatRouteDeps): Promise<Response> => {
  const { resourceId, threadId } = callerOf(input.requestContext);
  if (resourceId === undefined || threadId === undefined || !deps.owners.isOwnedBy(input.runId, { resourceId, threadId })) return noContent();
  const owner = deps.owners.ownerOf(input.runId);
  const durableId = owner === undefined ? undefined : await durableIdOf(deps, owner.agentId, input.requestContext);
  if (durableId === undefined) return noContent();
  const agent = input.mastra.getAgentById(durableId) as unknown as DurableAgent;
  await publishAbortRequest(agent.pubsub, input.runId);
  deps.logger.info("chat_run_abort_requested", { requestId: input.requestContext.get("requestId"), runId: input.runId });
  return noContent();
};
