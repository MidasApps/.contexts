import type { Agent } from "@mastra/core/agent";
import { createActionAgentDefinition } from "../agents/action-agent.ts";
import { createDataAgentDefinition } from "../agents/data-agent.ts";
import { createKnowledgeAgentDefinition } from "../agents/knowledge-agent.ts";
import { PING_AGENT } from "../agents/ping-agent.ts";
import { createSupervisorAgent, SUPERVISOR_AGENT_ID } from "../agents/supervisor-agent.ts";
import { createWebAgentDefinition } from "../agents/web-agent.ts";
import type { ChatRuntime } from "../chat/chat-http.ts";
import { createChatRunOwners } from "../chat/chat-run-owners.ts";
import { SUMMARIZER_AGENT_ID } from "../chat/conversation-summarizer.ts";
import { chatAgentIdOf, createDurableChatAgent } from "../chat/durable-supervisor.ts";
import { createToolPreviewer } from "../chat/tool-preview.ts";
import { CUSTOM_AGENT_RUN_IDS, type CustomAgentRuntime } from "../custom/compose-custom-agents.ts";
import { CUSTOM_AGENT_ID } from "../custom/custom-agent-tools.ts";
import type { AgentCommand } from "../tools/commands/agent-command.ts";
import { commandToolsOf } from "../tools/commands/command-tools.ts";
import type { CoreToolDeps } from "../tools/define-core-tool.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import { type AgentDefinition, type AgentFactoryDeps, AgentModuleError } from "./agent-module.ts";
import type { ComposeAgentRuntimeArgs } from "./compose-agent-runtime-args.ts";

/** Agents, their commands and the chat wrappers of the runtime (`composeAgentRuntime`). */

export const dirsOption = (dirs: readonly string[] | undefined) =>
  dirs === undefined ? {} : { instructionsDirs: dirs };

const coreAgents = (args: ComposeAgentRuntimeArgs, commands: readonly AgentCommand[]): AgentDefinition[] => [
  PING_AGENT,
  createKnowledgeAgentDefinition(dirsOption(args.instructionsDirs)),
  createDataAgentDefinition(dirsOption(args.instructionsDirs)),
  createActionAgentDefinition({
    commands,
    moduleIds: args.modules.map((module) => module.id),
    ...dirsOption(args.instructionsDirs),
  }),
  createWebAgentDefinition(dirsOption(args.instructionsDirs)),
];

/**
 * The action agent's tools: one per command of the registry (core first, then the installed
 * modules', decision 0025), plus commands a module declares directly in `AgentModule.commands`.
 */
export const collectCommands = (args: ComposeAgentRuntimeArgs): AgentCommand[] => [
  ...commandToolsOf(args.ports.commandRegistry),
  ...args.modules.flatMap((module) => module.commands ?? []),
];

export const collectAgents = (args: ComposeAgentRuntimeArgs, commands: readonly AgentCommand[]): AgentDefinition[] => {
  const all = [...coreAgents(args, commands), ...args.modules.flatMap((module) => module.agents ?? [])];
  const seen = new Set<string>([SUPERVISOR_AGENT_ID]);
  for (const agent of all) {
    if (seen.has(agent.id))
      throw new AgentModuleError({ code: "DUPLICATE_CAPABILITY", moduleId: "runtime", capabilityId: agent.id });
    seen.add(agent.id);
  }
  return all;
};

/** The supervisor calls no core tool itself; its subagents' calls are capped by their own ceilings. */
export const SUPERVISOR_CEILING = ["core.chat.use"];

// Module agents are subagents unless they declare `entry`; `ping` is the core entry smoke agent.
export const isEntry = (definition: AgentDefinition): boolean =>
  definition.role === "entry" || (definition.role === undefined && definition.id === PING_AGENT.id);

/** Entry agents (Mastra `agents`), the subagents and the supervisor over them. */
export const buildAgents = (
  definitions: readonly AgentDefinition[],
  deps: AgentFactoryDeps,
  instructionsDirs: readonly string[] | undefined,
) => {
  const build = (list: readonly AgentDefinition[]) =>
    Object.fromEntries(list.map((definition) => [definition.id, definition.create(deps)]));
  const subagents = build(definitions.filter((definition) => !isEntry(definition)));
  const supervisor = createSupervisorAgent({
    deps,
    subagents,
    ...(instructionsDirs === undefined ? {} : { instructionsDirs }),
  });
  return { agents: { ...build(definitions.filter(isEntry)), [SUPERVISOR_AGENT_ID]: supervisor }, subagents };
};

/** Chat entry agents (spec §4.2): the supervisor gets a durable wrapper served by `/chat/*`. */
const CHAT_AGENT_IDS = [SUPERVISOR_AGENT_ID];

export const buildChat = (
  agents: Record<string, Agent>,
  deps: { tools: ToolRegistry; toolDeps: CoreToolDeps; summarizer: Agent; custom: CustomAgentRuntime },
) => {
  const durable = CHAT_AGENT_IDS.flatMap((id) =>
    agents[id] === undefined ? [] : [[id, createDurableChatAgent(agents[id])] as const],
  );
  const runtime: ChatRuntime = {
    chatAgents: Object.fromEntries(durable.map(([id]) => [id, chatAgentIdOf(id)])),
    owners: createChatRunOwners(),
    previewer: createToolPreviewer({ tools: deps.tools, toolDeps: deps.toolDeps }),
    summarizer: deps.summarizer,
    // Decision 0046: an enabled custom agent of the caller's tenant runs on the generic durable agent.
    resolveCustomAgent: deps.custom.resolveChatAgent,
    customRunAgentId: chatAgentIdOf(CUSTOM_AGENT_ID),
  };
  // DurableAgent extends Agent; Mastra registers it (workflow, cache, PubSub) like any agent. The
  // summarizer is registered too (spans, usage ledger) but, like the wrappers, only custom routes reach it.
  // The custom agent and its wrapper are reachable through `/chat/:agentId` only, never `/api/agents/*`.
  const registered = {
    ...Object.fromEntries(durable.map(([id, agent]) => [chatAgentIdOf(id), agent as unknown as Agent])),
    [SUMMARIZER_AGENT_ID]: deps.summarizer,
    [CUSTOM_AGENT_ID]: deps.custom.agent,
    [chatAgentIdOf(CUSTOM_AGENT_ID)]: createDurableChatAgent(deps.custom.agent) as unknown as Agent,
  };
  return {
    runtime,
    agents: { ...agents, ...registered },
    hiddenAgentIds: [...new Set([...Object.keys(registered), ...CUSTOM_AGENT_RUN_IDS])],
  };
};
