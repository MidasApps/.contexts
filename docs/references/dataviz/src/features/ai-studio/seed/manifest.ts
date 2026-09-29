import type { AiEntityType } from '../protection';
import {
  buildDescriptiveStatic, buildDiagnosticStatic, buildPredictiveStatic, buildPrescriptiveStatic,
  buildMonitoringStatic, buildSimulationStatic, buildExternalStatic, buildCashflowStatic, buildOrchestratorStatic,
} from '@/shared/config/agents';
import { DEFAULT_AGENT_TOOLS } from '@/shared/config/agents/default-agent-tools';
import { RESPONSE_STYLE_PLAYBOOK, SQL_FOUNDATIONS_PLAYBOOK, PORTFOLIO_SCHEMA_PLAYBOOK, CREDIT_DOMAIN_PLAYBOOK } from './skill-playbooks';

export interface SeedRecord { type: AiEntityType; id: string; doc: Record<string, unknown>; }

const SUB_AGENT_SKILLS = ['response-style', 'sql-foundations', 'portfolio-schema', 'credit-domain'];

function agent(id: string, name: string, instructions: string, model: string, extra: Record<string, unknown> = {}): SeedRecord {
  return {
    type: 'agent', id,
    doc: {
      name, instructions, kind: 'worker', model, status: 'active',
      origin: 'system', systemKey: id, description: name,
      skillRefs: id === 'orchestrator' ? [] : SUB_AGENT_SKILLS, toolRefs: DEFAULT_AGENT_TOOLS[id] ?? [], knowledgeBaseRefs: [],
      ...extra,
    },
  };
}

function skill(id: string, name: string, description: string, playbook: string): SeedRecord {
  return {
    type: 'skill', id,
    doc: { name, description, playbook, toolRefs: [], knowledgeBaseRefs: [], status: 'active', origin: 'system', systemKey: id },
  };
}

/**
 * Instrução do workflow padrão — a voz mais forte do prompt do supervisor.
 *
 * A versão anterior descrevia SÓ o fluxo analítico ("identifique a intenção,
 * acione o agente, componha uma resposta"). Com as tools de autoria no
 * supervisor (ADR-0020) isso passou a produzir a resposta errada para pedido de
 * construção: o modelo delegava ao sub-agente descritivo, devolvia uma lista de
 * indicadores e oferecia ajuda — sem nunca chamar `add_*_block`. A seção de
 * autoria do código competia em 939 chars contra 9.4k de instrução analítica.
 */
export const DEFAULT_WORKFLOW_INSTRUCTION = `Identifique a intenção do comando antes de agir. São duas famílias, e elas se resolvem de formas diferentes.

**Analisar** (descritiva, diagnóstica, preditiva, prescritiva): acione o(s) sub-agente(s) correspondente(s), priorize dados reais via SQL e componha uma resposta clara, com citação de fonte em toda afirmação numérica ou regulatória.

**Construir ou alterar página** (criar página, adicionar/editar/remover indicador, gráfico, tabela ou texto): isto é SEU, não de sub-agente. Proponha o que vai fazer, nomeando métricas que existem no catálogo do cliente, e pergunte se pode seguir. Quando o usuário confirmar — ou quando o pedido já vier confirmado ("escolha você", "não entendo do assunto", "faça o que achar melhor") — CHAME AS FERRAMENTAS de autoria na mesma resposta. Nunca responda a uma confirmação repetindo a proposta.

Quando o pedido misturar as duas famílias ("analise a inadimplência e coloque na página"), analise primeiro e use o resultado para construir.`;


export const SYSTEM_SEEDS: SeedRecord[] = [
  agent('orchestrator', 'Supervisor Analítico', buildOrchestratorStatic(), 'router', { kind: 'orchestrator' }),
  agent('descriptive', 'Agente Descritivo', buildDescriptiveStatic(), 'fast'),
  agent('diagnostic', 'Agente Diagnóstico', buildDiagnosticStatic(), 'reasoning'),
  agent('predictive', 'Agente Preditivo', buildPredictiveStatic(), 'reasoning'),
  agent('prescriptive', 'Agente Prescritivo', buildPrescriptiveStatic(), 'reasoning'),
  agent('monitoring', 'Agente de Monitoramento', buildMonitoringStatic(), 'reasoning'),
  agent('simulation', 'Agente de Simulação', buildSimulationStatic(), 'reasoning'),
  agent('external', 'Agente Externo', buildExternalStatic(), 'fast'),
  agent('cashflow', 'Agente de Fluxo de Caixa', buildCashflowStatic(), 'fast'),
  skill('response-style', 'Estilo de Resposta', 'Regras de resposta (pt-BR, concisão, tratamento de erro).', RESPONSE_STYLE_PLAYBOOK),
  skill('sql-foundations', 'Fundamentos SQL', 'Regras de SQL (SELECT-only, SAFE_DIVIDE, formatação).', SQL_FOUNDATIONS_PLAYBOOK),
  skill('portfolio-schema', 'Schema da Carteira', 'Documentação das tabelas BigQuery (contratos/pagamentos/fluxo_caixa).', PORTFOLIO_SCHEMA_PLAYBOOK),
  skill('credit-domain', 'Domínio de Crédito', 'Glossário, escala de rating, PDD/Res. 2682 e fórmulas.', CREDIT_DOMAIN_PLAYBOOK),
  {
    type: 'workflow', id: 'default',
    doc: {
      name: 'Atendimento Analítico Padrão',
      description: 'Fluxo padrão para qualquer pergunta analítica sobre a carteira de crédito.',
      instruction: DEFAULT_WORKFLOW_INSTRUCTION,
      isDefault: true, status: 'active', origin: 'system', systemKey: 'default',
    },
  },
  {
    type: 'knowledgeBase', id: 'default',
    doc: {
      name: 'Base de Conhecimento Padrão',
      description: 'Documentos gerais (mercado, produto, negócio) — absorve os embeddings legados.',
      clientId: null, embeddingModel: 'gemini-embedding-001', docCount: 0, chunkCount: 0,
      status: 'active', origin: 'system', systemKey: 'default',
    },
  },
];

const COLLECTION_BY_TYPE: Record<AiEntityType, string> = {
  agent: 'aiAgents', skill: 'aiSkills', workflow: 'aiWorkflows', knowledgeBase: 'knowledgeBases',
};
export function collectionForType(type: AiEntityType): string { return COLLECTION_BY_TYPE[type]; }
export function getSeed(type: AiEntityType, id: string): SeedRecord | undefined {
  return SYSTEM_SEEDS.find((s) => s.type === type && s.id === id);
}
