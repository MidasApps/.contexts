/**
 * Mastra Agent — predictive_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildPredictiveStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createPredictiveAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'predictive',
    name: 'Predictive Agent',
    description: 'Projeta tendências: forecast, PD/LGD, early warnings, CPR/CDR, curvas vintage e matrizes de transição.',
    defaultModelTier: 'reasoning',
    buildStatic: buildPredictiveStatic,
    ctx: input.ctx,
  });
}
