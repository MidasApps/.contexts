import type { ChatAgentOption, CustomAgentId, CustomAgentLimits, TenantId } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import { authorizeCustomAgents, CHAT_USE_PERMISSION, CUSTOM_AGENTS_READ_PERMISSION, type CustomAgentsCommand, type CustomAgentsDeps } from "../custom-agents-deps.ts";

type ReadCommand = Omit<CustomAgentsCommand, "requestId">;

export type CustomAgentUsage = { readonly limits: CustomAgentLimits; readonly usage: { readonly agents: number; readonly skills: number } };

export type GetCustomAgentUsage = (command: ReadCommand) => Promise<Result<CustomAgentUsage, AccessDeniedError>>;
export type ListChatAgents = (command: ReadCommand) => Promise<Result<ChatAgentOption[], AccessDeniedError>>;
/** Server-side check of `/v1/chat`: no authorization, the tenant is the conversation's. */
export type IsChatAgentEnabled = (input: { readonly tenantId: TenantId; readonly agentId: CustomAgentId }) => Promise<boolean>;

/** The supervisor, as every member's default chat agent. */
export const ASSISTANT_CHAT_AGENT: ChatAgentOption = {
  id: "assistant",
  name: "Assistant",
  description: "Answers, plans the work and delegates to the specialists the organization enabled.",
  source: "core",
};

/** The plan limits of the organization and how much of them is used (`core.agent-settings.read`). */
export const makeGetCustomAgentUsage =
  (deps: Pick<CustomAgentsDeps, "agents" | "skills" | "limits">): GetCustomAgentUsage =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CUSTOM_AGENTS_READ_PERMISSION);
    if (!allowed.ok) return allowed;
    const [limits, agents, skills] = await Promise.all([
      deps.limits(command.tenantId),
      deps.agents.count({ tenantId: command.tenantId }),
      deps.skills.count({ tenantId: command.tenantId }),
    ]);
    return ok({ limits, usage: { agents, skills } });
  };

/** The agents a member can chat with (`core.chat.use`): the assistant and the organization's enabled agents. */
export const makeListChatAgents =
  (deps: Pick<CustomAgentsDeps, "agents">): ListChatAgents =>
  async (command) => {
    const allowed = await authorizeCustomAgents(command, CHAT_USE_PERMISSION);
    if (!allowed.ok) return allowed;
    const custom = (await deps.agents.listByTenant({ tenantId: command.tenantId }))
      .filter((agent) => agent.enabled)
      .map((agent): ChatAgentOption => ({ id: agent.id, name: agent.name, description: agent.description, source: "custom" }));
    return ok([ASSISTANT_CHAT_AGENT, ...custom]);
  };

export const makeIsChatAgentEnabled =
  (deps: Pick<CustomAgentsDeps, "agents">): IsChatAgentEnabled =>
  async ({ tenantId, agentId }) =>
    (await deps.agents.get(undefined, { tenantId, agentId }))?.enabled === true;
