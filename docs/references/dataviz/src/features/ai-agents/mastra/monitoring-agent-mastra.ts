/**
 * Mastra Agent — monitoring_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildMonitoringStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createMonitoringAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'monitoring',
    name: 'Monitoring Agent',
    description: 'Monitora compliance: anomalias, elegibilidade CRI, limites CVM 60, covenants e relatório de compliance.',
    defaultModelTier: 'reasoning',
    buildStatic: buildMonitoringStatic,
    ctx: input.ctx,
  });
}
