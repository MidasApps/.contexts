/**
 * Mastra Agent — diagnostic_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { buildDiagnosticStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createDiagnosticAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'diagnostic',
    name: 'Diagnostic Agent',
    description: 'Diagnostica causas: correlações, concentração HHI, decomposição de variações e testes de hipótese.',
    defaultModelTier: 'reasoning',
    buildStatic: buildDiagnosticStatic,
    ctx: input.ctx,
  });
}
