import type { ChatAgentOption } from "@core/contracts";
import { ASSISTANT_AGENT_ID } from "../api/chat-agents-api.ts";

/**
 * The name to show for a conversation's agent: the assistant's own copy, the name of an agent of
 * the organization, or `undefined` when that agent is no longer listed (disabled or deleted; the
 * caller shows a generic label).
 */
export const agentNameOf = (args: {
  readonly agentId: string;
  readonly agents: readonly ChatAgentOption[] | undefined;
  readonly assistant: string;
}): string | undefined =>
  args.agentId === ASSISTANT_AGENT_ID ? args.assistant : args.agents?.find((agent) => agent.id === args.agentId)?.name;
