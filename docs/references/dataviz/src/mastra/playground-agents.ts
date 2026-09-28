/**
 * Monta os agentes do playground pelo MESMO caminho da rota `/api/chat`:
 * `buildMastraInstance` constrói os 8 sub-agentes e `buildSupervisorAgent` o
 * supervisor, com `agents:` e as tools de autoria. O que muda é só a origem do
 * contexto: aqui ele vem do env (`playground-config.ts`), lá do token e do
 * corpo da requisição.
 *
 * Só é carregado pelo `index.ts` DEPOIS da guarda de banco — importar este
 * módulo não pode ser o que abre a primeira conexão com o Firestore.
 */
import type { Agent } from '@mastra/core/agent';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { buildMastraInstance } from '@/features/ai-agents/mastra/instance';
import { buildSupervisorAgent } from '@/features/ai-agents/mastra/build-supervisor-agent';
import { SPECIALISTS } from '@/shared/config/agents/chat-agent-catalog';
import { DEFAULT_WORKFLOW_INSTRUCTION } from '@/features/ai-studio/seed/manifest';
import { getClientSemanticContext } from '@/shared/repositories/client-semantic-context';
import { getDb } from '@/shared/lib/firebase/admin';
import { primaryDatasetOf } from '@/shared/lib/clients/primary-dataset';
import type { PlaygroundConfig } from './playground-config';

/** O dataset que o navegador mandaria para este cliente (`useActiveDataset`). */
async function resolveDataset(config: PlaygroundConfig): Promise<string> {
  if (config.dataset) return config.dataset;
  const snap = await getDb().collection('clients').doc(config.clientId).get();
  if (!snap.exists) {
    throw new Error(`clients/${config.clientId} não existe neste banco — confira MASTRA_DEV_CLIENT_ID.`);
  }
  const dataset = primaryDatasetOf(snap.data() ?? {});
  if (!dataset) {
    throw new Error(`clients/${config.clientId} não tem dataset — defina MASTRA_DEV_DATASET.`);
  }
  return dataset;
}

export async function buildPlaygroundContext(config: PlaygroundConfig): Promise<AgentDynamicContext> {
  const [dataset, semanticContext] = await Promise.all([
    resolveDataset(config),
    getClientSemanticContext(config.clientId),
  ]);
  return {
    dataset,
    clientId: config.clientId,
    filters: { dateRange: config.dateRange, compareEnabled: false },
    dashboardState: '',
    page: '/playground',
    sessionId: 'mastra-playground',
    semanticContext: semanticContext ?? undefined,
    userEmail: config.userEmail,
  };
}

/**
 * Supervisor + 8 especialistas. A instrução de workflow é a baseline em código:
 * a rota escolhe o workflow pela última pergunta, e aqui não há pergunta no
 * momento da montagem.
 */
export async function buildPlaygroundAgents(config: PlaygroundConfig): Promise<Record<string, Agent>> {
  const ctx = await buildPlaygroundContext(config);
  const instance = await buildMastraInstance({ ctx });

  const subAgents: Record<string, Agent> = {};
  for (const key of SPECIALISTS) {
    try { subAgents[key] = instance.getAgent(key); } catch { /* fail-soft, como na rota */ }
  }
  const supervisor = await buildSupervisorAgent({
    instruction: DEFAULT_WORKFLOW_INSTRUCTION,
    ctx,
    subAgents,
    pagesContext: [],
  });

  console.info(JSON.stringify({
    level: 'info',
    msg: 'mastra_playground_agents',
    clientId: ctx.clientId,
    dataset: ctx.dataset,
    agents: ['supervisor', ...Object.keys(subAgents)],
  }));
  return { supervisor, ...subAgents };
}
