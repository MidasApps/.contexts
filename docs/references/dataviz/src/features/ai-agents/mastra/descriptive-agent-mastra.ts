/**
 * Mastra Agent — descriptive_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildDescriptiveStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createDescriptiveAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'descriptive',
    name: 'Descriptive Agent',
    description: 'Analisa dados da carteira: resumos, KPIs, estatísticas descritivas, curvas vintage, matrizes de transição e consultas SQL.',
    defaultModelTier: 'fast',
    buildStatic: buildDescriptiveStatic,
    ctx: input.ctx,
  });
}
