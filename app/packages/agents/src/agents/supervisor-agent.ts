import { Agent, type DelegationStartContext, type DelegationStartResult } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import type { AgentFactoryDeps } from "../runtime/agent-module.ts";
import { loadInstructions } from "./load-instructions.ts";
import type { TenantAgentSettingsReader } from "./tenant-agent-settings.ts";

export const SUPERVISOR_AGENT_ID = "assistant";
export const SUPERVISOR_INSTRUCTIONS = "assistant.v1";
/** The supervisor plans and delegates in at most 8 steps (spec §6). */
export const SUPERVISOR_MAX_STEPS = 8;

// Mastra fills the run's own ids in; anything else was written by the model.
const sameOrAbsent = (requested: string | undefined, server: string | undefined): boolean => requested === undefined || requested === server;

/**
 * `onDelegationStart` of the supervisor (spec §6, §14): the tenant's settings decide, on the
 * server, which subagent may run; `web` needs the tenant's opt-in. It also refuses
 * memory ids other than the run's own (a subagent inherits the supervisor memory under
 * `<resourceId>-<agent>`, so a model-supplied resource could name another tenant's) and
 * drops model-written instruction overrides: the subagent keeps its versioned instructions.
 */
export const createDelegationGuard =
  (tenantSettings: TenantAgentSettingsReader) =>
  async (context: DelegationStartContext): Promise<DelegationStartResult> => {
    const { enabledAgents } = await tenantSettings(context.requestContext);
    if (!enabledAgents.has(context.primitiveId)) {
      return { proceed: false, rejectionReason: `The ${context.primitiveId} specialist is not enabled for this organization.` };
    }
    if (!sameOrAbsent(context.params.threadId, context.threadId) || !sameOrAbsent(context.params.resourceId, context.resourceId)) {
      return { proceed: false, rejectionReason: "Delegate again without threadId or resourceId; the server assigns them." };
    }
    return { proceed: true, modifiedInstructions: "" };
  };

/** The subagents this run's tenant enabled (keys = agent ids, the `agent-<id>` tool names). */
const enabledSubagentsOf =
  (subagents: Readonly<Record<string, Agent>>, tenantSettings: TenantAgentSettingsReader) =>
  async ({ requestContext }: { requestContext: RequestContext }): Promise<Record<string, Agent>> => {
    const { enabledAgents } = await tenantSettings(requestContext);
    return Object.fromEntries(Object.entries(subagents).filter(([key]) => enabledAgents.has(key)));
  };

/**
 * `assistant` supervisor (spec §6, decision 0019): the only chat entry point. It delegates
 * to the subagents its tenant enabled (`agent-<key>` tool calls; approvals of subagent
 * tools surface in its stream), owns the tenant-scoped memory (`resourceId = tenantId:uid`)
 * and runs the `entry` guardrail profile. Ceiling `core.chat.use`: every tool call runs
 * under the ceiling of the subagent that makes it.
 */
export const createSupervisorAgent = (args: {
  readonly deps: AgentFactoryDeps;
  readonly subagents: Readonly<Record<string, Agent>>;
  readonly instructionsDirs?: readonly string[];
}): Agent => {
  const { deps } = args;
  return new Agent({
    id: SUPERVISOR_AGENT_ID,
    name: "Assistant",
    description: "Answers the user, plans the work and delegates to the knowledge, data, action and web specialists the organization enabled.",
    instructions: loadInstructions(SUPERVISOR_INSTRUCTIONS, args.instructionsDirs),
    model: deps.models.language("chat", { agentId: SUPERVISOR_AGENT_ID }),
    agents: enabledSubagentsOf(args.subagents, deps.tenantSettings),
    skills: deps.skills([]),
    ...(deps.memory === undefined ? {} : { memory: deps.memory }),
    defaultOptions: {
      maxSteps: SUPERVISOR_MAX_STEPS,
      delegation: { onDelegationStart: createDelegationGuard(deps.tenantSettings), hookErrorStrategy: "throw" },
    },
    requestContextSchema: AgentRuntimeContextSchema,
    ...deps.guardrails("entry"),
  });
};
