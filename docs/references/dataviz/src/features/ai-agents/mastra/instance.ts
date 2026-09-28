/**
 * Mastra runtime instance (ADR-0014). Registra os 8 sub-agentes migrados.
 * Per-request: as tools fecham sobre o contexto dinâmico (dataset, filters,
 * clientId, personaId, sessionId). Fail-soft por agente: um factory que lança
 * é pulado e logado; os demais registram (no mínimo o descriptive sobe).
 * Nota: /api/chat usa `getAgent('descriptive')`; os demais ficam registrados
 * para o supervisor (Fase 4B), dormentes até lá.
 */
import { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import type { SpecialistId } from '@/shared/config/agents/chat-agent-catalog';
import { createDescriptiveAgentMastra } from './descriptive-agent-mastra';
import { createDiagnosticAgentMastra } from './diagnostic-agent-mastra';
import { createPredictiveAgentMastra } from './predictive-agent-mastra';
import { createPrescriptiveAgentMastra } from './prescriptive-agent-mastra';
import { createMonitoringAgentMastra } from './monitoring-agent-mastra';
import { createSimulationAgentMastra } from './simulation-agent-mastra';
import { createExternalAgentMastra } from './external-agent-mastra';
import { createCashflowAgentMastra } from './cashflow-agent-mastra';

export interface MastraInstanceContext {
  ctx: AgentDynamicContext;
}

type AgentFactory = (input: { ctx: AgentDynamicContext }) => Promise<Agent>;

/*
 * Tipado por `SpecialistId`, e não por `string`: o seletor de agente do chat
 * oferece exatamente estas chaves. Um id no catálogo sem factory aqui (ou o
 * contrário) para o build, em vez de virar um "agente indisponível" que o
 * usuário só descobre depois de mandar a pergunta.
 */
const AGENT_FACTORIES: Record<SpecialistId, AgentFactory> = {
  descriptive: createDescriptiveAgentMastra,
  diagnostic: createDiagnosticAgentMastra,
  predictive: createPredictiveAgentMastra,
  prescriptive: createPrescriptiveAgentMastra,
  monitoring: createMonitoringAgentMastra,
  simulation: createSimulationAgentMastra,
  external: createExternalAgentMastra,
  cashflow: createCashflowAgentMastra,
};

export async function buildMastraInstance(input: MastraInstanceContext): Promise<Mastra> {
  // Em paralelo: cada factory lê config e skills no Firestore, e em série os 8
  // somavam ~2,5s por mensagem. O try/catch continua POR AGENTE — o fail-soft
  // descrito acima depende de uma falha isolada não derrubar as outras 7.
  const built = await Promise.all(
    Object.entries(AGENT_FACTORIES).map(async ([key, factory]) => {
      try {
        return [key, await factory({ ctx: input.ctx })] as const;
      } catch (e) {
        console.error(`[mastra] agente "${key}" falhou ao construir — pulado`, e);
        return null;
      }
    }),
  );

  const agents: Record<string, Agent> = {};
  for (const par of built) {
    if (par) agents[par[0]] = par[1];
  }
  return new Mastra({ agents: agents as never });
}
