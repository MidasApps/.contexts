import { Agent } from '@mastra/core/agent';
import { buildOrchestratorStatic } from '@/shared/config/agents';
import { buildOrchestratorDynamicContext } from '@/shared/config/agents/dynamic-context';
import { resolveAgentInstructions } from '@/features/ai-studio/runtime/resolve-agent';
import { getModel, MAX_MODEL_RETRIES } from '@/features/ai-agents/model-registry';
import type { AgentDynamicContext, CanvasPageContext, ModelTier } from '@/shared/config/agents/types';
import { buildAuthoringTools, buildAuthoringPromptSection } from './authoring-tools';
import { withRedactedErrors } from '@/features/ai-studio/runtime/redact-tool-errors';

/**
 * Tier do supervisor.
 *
 * Era `router` desde quando ele só roteava — escolher um sub-agente e repassar.
 * Hoje ele orquestra 11 ferramentas de autoria com prompt de ~21k chars, e a
 * escolha vivia enterrada num `getModel('router')`, onde ninguém a revisitou.
 *
 * Medido em 12/08/2026, fluxo de autoria completo (confirmação → criar blocos),
 * n=3 por tier, conversa nova a cada amostra:
 *
 * | tier   | modelo              | sucesso | mediana  | blocos criados |
 * |--------|---------------------|---------|----------|----------------|
 * | router | 3.5-flash-lite      | 3/3     |  4.555ms | 4 / **8** / **8** |
 * | fast   | 3.6-flash           | 3/3     | 10.746ms | 4 / 4 / 4      |
 *
 * O flash-lite é mais rápido e duplica os blocos em 2 de 3 rodadas — chama
 * `add_kpi_block` duas vezes por indicador.
 *
 * Ligado o thinking config (que antes não chegava a agente nenhum), o 3.6-flash
 * no mesmo fluxo, n=3:
 *
 * | thinking          | mediana  | blocos  |
 * |-------------------|----------|---------|
 * | default (nenhum)  | 10.746ms | 4 / 4 / 4 |
 * | budget 2048       |  5.740ms | 4 / 4 / 4 |
 * | **budget 0**      |  **3.990ms** | 4 / 4 / 4 |
 *
 * Sem deliberar ele fica mais rápido (3.990ms × 5.740ms), mas o tier ficou em
 * **`fast`** (budget 2048), e não `flash`, por estabilidade de tool-calling.
 *
 * Duas falhas intermitentes observadas com thinking zero, ambas em turno com
 * ferramenta: um `AGENT_STREAM_ERROR` sem payload, e um turno que devolveu
 * argumento corrompido (texto árabe no meio do payload) e derrubou o passo
 * seguinte com "Requests ending with a model turn are not supported". Não
 * reproduzem sob demanda — mas casam com o padrão já medido aqui de que menos
 * deliberação piora chamada de ferramenta: o flash-lite, o mais rápido e sem
 * thinking nenhum, duplicava blocos em 2 de 3 rodadas.
 *
 * 1,7s a mais por turno é o preço de não entregar erro intermitente ao usuário.
 * Se voltar a falhar com 2048, o próximo suspeito é o `3.1-pro-preview` do tier
 * `reasoning` — modelo preview, sem SLA.
 */
export const TIER_DO_SUPERVISOR: ModelTier = 'fast';

export interface SupervisorAgentInput {
  instruction: string;                  // workflow.instruction
  ctx: AgentDynamicContext;
  subAgents: Record<string, unknown>;   // os 8 Mastra Agents
  /** Blocos da página aberta, quando há uma. Alimenta as tools de autoria. */
  pagesContext?: CanvasPageContext[];
  selectedBlockIds?: string[];
}

/**
 * Supervisor Mastra: instruções = orchestrator (config, fallback no estático de
 * código) + instrução do workflow + autoria + contexto dinâmico. Async (lê config).
 *
 * Ele delega análise aos sub-agentes (`agents:`) E constrói páginas (`tools:`).
 * Eram duas pilhas separadas — o supervisor só analisava, e quem construía era
 * o orquestrador de canvas, atrás de outra rota, alcançável só no modo de
 * edição. Daí o assistente responder que "não tem a funcionalidade de criar
 * páginas" dependendo da tela em que a pessoa estava.
 */
export async function buildSupervisorAgent(input: SupervisorAgentInput): Promise<Agent> {
  const orchestrator = await resolveAgentInstructions('orchestrator', buildOrchestratorStatic());
  const authoring = {
    clientId: input.ctx.clientId,
    userEmail: input.ctx.userEmail,
    activeGroupId: input.ctx.activeGroupId,
    activeReportId: input.ctx.activeReportId,
    // Entidades e atributos do contrato: matéria-prima de métrica nova, e o que
    // permite decidir se uma alteração pode ser feita no lugar.
    semanticContext: input.ctx.semanticContext,
    pagesContext: input.pagesContext,
    selectedBlockIds: input.selectedBlockIds,
    // Bloco aponta para métrica: sem o catálogo a tool não recusa id inventado,
    // e bloco com métrica inexistente nunca carrega dado.
    metricIds: input.ctx.semanticContext?.metrics?.map((m) => m.id),
  };
  const instructions = [
    orchestrator,
    input.instruction,
    buildAuthoringPromptSection(authoring),
    buildOrchestratorDynamicContext(input.ctx),
  ].join('\n\n');

  return new Agent({
    id: 'supervisor',
    name: 'Supervisor Analítico',
    description: 'Orquestra os sub-agentes analíticos e constrói páginas conforme o pedido.',
    instructions,
    model: getModel(TIER_DO_SUPERVISOR) as never,
    // 429 do provedor não pode custar o turno inteiro — ver a constante.
    maxRetries: MAX_MODEL_RETRIES,
    agents: input.subAgents as never,
    // Tools de autoria não passam pelo registry: a redação de erro lançado
    // (`redact-tool-errors.ts`) é aplicada aqui.
    tools: Object.fromEntries(
      Object.entries(buildAuthoringTools(authoring)).map(([name, t]) => [name, withRedactedErrors(t)]),
    ) as never,
  });
}
