/**
 * Mastra Agent — prescriptive_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildPrescriptiveStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createPrescriptiveAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'prescriptive',
    name: 'Prescriptive Agent',
    description: 'Recomenda ações: priorização multicritério, avaliação de impacto, segmentação e otimização.',
    defaultModelTier: 'reasoning',
    buildStatic: buildPrescriptiveStatic,
    ctx: input.ctx,
  });
}
