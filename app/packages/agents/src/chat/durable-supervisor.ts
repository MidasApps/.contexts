import type { Agent } from "@mastra/core/agent";
import { createDurableAgent, type DurableAgent } from "@mastra/core/agent/durable";

/** Suffix of the Mastra id of a chat agent's durable wrapper (`assistant` → `assistant-chat`). */
export const CHAT_AGENT_SUFFIX = "-chat";

/**
 * How long a finished run stays observable (registry entry and cached chunks). Mastra's default
 * is 30 s; a client that reconnects later reloads the messages from memory (decision 0031).
 */
export const CHAT_RUN_CLEANUP_MS = 60_000;

export const chatAgentIdOf = (agentId: string): string => `${agentId}${CHAT_AGENT_SUFFIX}`;

/**
 * Durable wrapper of a chat entry agent (SP4 spec §4.2, decision 0031): resumable streams
 * (`observe`), remote abort and approval resume through the same run. It is registered next to
 * the plain agent under its own id, so `/api/agents/<id>/*`, the MCP `ask_<id>` tool and the
 * evals keep the plain agent. The PubSub is inherited from `new Mastra({ pubsub })`.
 */
export const createDurableChatAgent = (agent: Agent): DurableAgent =>
  createDurableAgent({ agent, id: chatAgentIdOf(agent.id), name: agent.name, cleanupTimeoutMs: CHAT_RUN_CLEANUP_MS });
