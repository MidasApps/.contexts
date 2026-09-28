/**
 * Mastra Agent — cashflow_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildCashflowStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createCashflowAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'cashflow',
    name: 'Cashflow Agent',
    description: 'Analisa fluxo de caixa: WAL, excess spread, cobertura, comparação esperado vs contratado e decomposição de pagamentos.',
    defaultModelTier: 'fast',
    buildStatic: buildCashflowStatic,
    ctx: input.ctx,
  });
}
