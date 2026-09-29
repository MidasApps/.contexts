/**
 * Mastra Agent — simulation_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildSimulationStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createSimulationAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'simulation',
    name: 'Simulation Agent',
    description: 'Executa simulações e cenários hipotéticos: stress, sensibilidade, Monte Carlo e cenários determinísticos.',
    defaultModelTier: 'reasoning',
    buildStatic: buildSimulationStatic,
    ctx: input.ctx,
  });
}
