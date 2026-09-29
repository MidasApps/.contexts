/**
 * Mastra Agent — external_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildExternalStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createExternalAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'external',
    name: 'External Agent',
    description: 'Busca informações externas: indicadores BCB, notícias, benchmarks de mercado, análise de sentimento e atualizações regulatórias.',
    defaultModelTier: 'fast',
    buildStatic: buildExternalStatic,
    ctx: input.ctx,
  });
}
