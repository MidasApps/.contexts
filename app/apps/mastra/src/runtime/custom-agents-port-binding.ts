import type { AgentRuntimePorts } from "@core/agents";
import { CustomAgentIdSchema, TenantIdSchema } from "@core/contracts";
import type { CustomAgentsRuntimeReads } from "@core/services";

/**
 * `customAgents` port (decision 0046) over the custom agents context's server-side reads
 * (Firestore `custom-agents` / `custom-skills`). The tenant comes from the verified context of
 * the run; an agent id that is not a custom agent id reads as missing without touching the store.
 */
export const bindCustomAgentsPort = (reads: CustomAgentsRuntimeReads): AgentRuntimePorts["customAgents"] => ({
  getAgent: ({ tenantId, agentId }) => {
    const id = CustomAgentIdSchema.safeParse(agentId);
    return id.success
      ? reads.getAgent({ tenantId: TenantIdSchema.parse(tenantId), agentId: id.data })
      : Promise.resolve(null);
  },
  listAgents: ({ tenantId }) => reads.listAgents({ tenantId: TenantIdSchema.parse(tenantId) }),
  listSkills: ({ tenantId }) => reads.listSkills({ tenantId: TenantIdSchema.parse(tenantId) }),
});
