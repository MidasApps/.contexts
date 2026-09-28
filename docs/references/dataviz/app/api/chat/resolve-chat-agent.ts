import type { Mastra } from '@mastra/core';
import type { AgentDynamicContext, CanvasPageContext } from '@/shared/config/agents/types';
import { loadWorkflows } from '@/features/ai-studio/runtime/config-loader';
import { selectWorkflow } from '@/features/ai-studio/runtime/select-workflow';
import { buildSupervisorAgent } from '@/features/ai-agents/mastra/build-supervisor-agent';
import { DEFAULT_WORKFLOW_INSTRUCTION } from '@/features/ai-studio/seed/manifest';
import { DEFAULT_AGENT_ID, SPECIALISTS, resolveChatAgentId } from '@/shared/config/agents/chat-agent-catalog';

const SUB_AGENT_KEYS = SPECIALISTS;

/** Texto concatenado da última mensagem de role 'user' (UIMessage.parts). */
export function lastUserText(messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      return (messages[i].parts ?? [])
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join(' ');
    }
  }
  return '';
}

function collectSubAgents(mastra: Mastra): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SUB_AGENT_KEYS) {
    try { out[key] = mastra.getAgent(key); } catch { /* fail-soft (4A) */ }
  }
  return out;
}

/**
 * Seleciona o agente que atende ao chat.
 *
 * O supervisor É o produto: ele traz os 8 sub-agentes E as tools de autoria. O
 * workflow contribui com uma seção do prompt (~4% dele), não com capacidade.
 *
 * Ausência de workflow ativo derrubava tudo para o `descriptive` puro — sem
 * supervisor, sem autoria. Quem pedisse uma página recebia uma análise em texto,
 * e o modelo respondia, com razão sobre si mesmo, que não sabia criar páginas.
 * Nada disso aparecia: o ramo dos zero workflows nem logava. Como a coleção
 * `aiWorkflows` é editável pelo admin, desativar o único doc que existe bastava
 * para o produto perder metade das funções em silêncio.
 *
 * A cadeia agora degrada por etapa, e não de uma vez: instrução do Firestore →
 * baseline em código → e só quando o próprio supervisor não constrói é que o
 * `descriptive` entra, aí sim com log de erro.
 */
/**
 * Quem atendeu o turno, e se ele podia criar algo.
 *
 * Existe porque a ausência disto tornou um defeito indiagnosticável: o usuário
 * pediu um relatório novo, o assistente respondeu que havia criado, e nada foi
 * escrito. Duas causas produzem exatamente essa tela — o modelo não chamou a
 * tool, ou o turno não tinha tool alguma — e elas pedem correções opostas. O
 * caminho do especialista, que é o silencioso, não logava nada: o seletor é
 * persistido, então quem o escolheu um dia segue sem autoria nas conversas
 * seguintes sem nenhum rastro.
 *
 * `warn` quando não há autoria: o turno não é capaz do que o usuário costuma
 * pedir ao assistente, e isso é degradação observável, não estado normal.
 */
function logResolvedAgent(agent: string, authoring: boolean): void {
  const line = JSON.stringify({
    level: authoring ? 'info' : 'warn',
    msg: 'chat_agent_resolvido',
    agente: agent,
    autoria: authoring,
    ...(authoring ? {} : { efeito: 'turno sem tools de autoria — não pode criar relatório, página ou bloco' }),
  });
  if (authoring) console.info(line);
  else console.warn(line);
}

export async function resolveChatAgent(input: {
  mastra: Mastra;
  ctx: AgentDynamicContext;
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>;
  /** Blocos da página aberta — alimentam as tools de autoria do supervisor. */
  pagesContext?: CanvasPageContext[];
  selectedBlockIds?: string[];
  /**
   * Especialista escolhido à mão no seletor do chat. Ausente (ou o supervisor)
   * mantém o comportamento de sempre. Ver `chat-agent-catalog.ts`.
   */
  agentId?: string;
}): Promise<unknown> {
  const chosen = resolveChatAgentId(input.agentId);
  if (chosen !== DEFAULT_AGENT_ID) {
    try {
      /*
       * Falar direto com o especialista é a escolha do usuário, e ela custa as
       * tools de autoria: elas vivem no supervisor. É o trade que o seletor
       * oferece — resposta de um especialista, sem o desvio da delegação.
       */
      const specialist = input.mastra.getAgent(chosen);
      logResolvedAgent(chosen, false);
      return specialist;
    } catch (e) {
      console.warn(JSON.stringify({
        level: 'warn',
        msg: 'especialista_indisponivel',
        agentId: chosen,
        efeito: 'requisição atendida pelo supervisor',
        err: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  try {
    const supervisor = await buildSupervisorAgent({
      instruction: await resolveWorkflowInstruction(input.messages),
      ctx: input.ctx,
      subAgents: collectSubAgents(input.mastra),
      pagesContext: input.pagesContext,
      selectedBlockIds: input.selectedBlockIds,
    });
    logResolvedAgent(DEFAULT_AGENT_ID, true);
    return supervisor;
  } catch (e) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'supervisor_indisponivel',
      efeito: 'chat sem tools de autoria nesta requisição',
      err: e instanceof Error ? { name: e.name, message: e.message } : String(e),
    }));
    const fallback = input.mastra.getAgent('descriptive');
    logResolvedAgent('descriptive', false);
    return fallback;
  }
}

/**
 * A instrução de workflow, com baseline em código quando não há doc ativo.
 *
 * Mesmo padrão de `resolveAgentInstructions`: config quando existe, código
 * quando não. Falha aqui não pode custar as tools de autoria.
 */
async function resolveWorkflowInstruction(
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>,
): Promise<string> {
  try {
    const workflows = await loadWorkflows();
    if (workflows.length === 0) {
      console.warn(JSON.stringify({
        level: 'warn',
        msg: 'sem_workflow_ativo',
        efeito: 'supervisor usa a instrução baseline do código',
      }));
      return DEFAULT_WORKFLOW_INSTRUCTION;
    }
    const wf = await selectWorkflow(lastUserText(messages), workflows);
    const instruction = String(wf.instruction ?? '').trim();
    return instruction || DEFAULT_WORKFLOW_INSTRUCTION;
  } catch (e) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'selecao_de_workflow_falhou',
      efeito: 'supervisor usa a instrução baseline do código',
      err: e instanceof Error ? { name: e.name, message: e.message } : String(e),
    }));
    return DEFAULT_WORKFLOW_INSTRUCTION;
  }
}
