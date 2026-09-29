/**
 * Sondagem do runtime de IA, contra o Vertex de verdade.
 *
 * Por que existe: a suíte mocka o Mastra inteiro. Ela prova a NOSSA lógica —
 * roteamento, tools, guardas —, não a API dele. Num upgrade de `@mastra/core`
 * (1.32 → 1.58 em 13/08/2026 foram 26 minors de uma vez) o typecheck e os 1769
 * testes passam mesmo que o runtime tenha mudado de comportamento, porque
 * nenhum deles chama o modelo.
 *
 * O que este script exercita, pelo MESMO caminho de código da rota /api/chat:
 *
 *   1. `buildMastraInstance` constrói os 8 sub-agentes (fail-soft por agente);
 *   2. `buildSupervisorAgent` monta o supervisor com `agents:` E `tools:`;
 *   3. `agent.stream()` com `maxSteps` conversa com o Vertex e devolve texto.
 *
 * Não substitui teste: não asserta nada de negócio, e depende de credencial e
 * de rede. É o smoke que se roda ANTES de commitar um upgrade de runtime.
 *
 * Uso:
 *   pnpm smoke:supervisor
 *
 * Requer ADC válido (`gcloud auth application-default login`) e `.env.local`.
 */
import { buildMastraInstance } from '@/features/ai-agents/mastra/instance';
import { buildSupervisorAgent } from '@/features/ai-agents/mastra/build-supervisor-agent';
import type { AgentDynamicContext } from '@/shared/config/agents/types';

/** Os mesmos 8 de `SUB_AGENT_KEYS` em `app/api/chat/resolve-chat-agent.ts`. */
const SUB_AGENTS = [
  'descriptive', 'diagnostic', 'predictive', 'prescriptive',
  'monitoring', 'simulation', 'external', 'cashflow',
] as const;

/*
 * Contexto mínimo porém COMPLETO: `buildDynamicFilterContext` lê
 * `filters.projetos.length` direto, então um ctx pela metade derruba os 8
 * agentes no fail-soft e o smoke passa dizendo 0/8 — falso negativo silencioso.
 */
const ctx = {
  dataset: 'vila_rosa',
  clientId: 'vila-rosa',
  filters: {
    dateRange: { start: '2025-01-01', end: '2025-12-31' },
    projetos: [],
    viewMode: 'snapshot',
    advancedFilters: {},
  },
  sessionId: 'smoke-supervisor',
} as unknown as AgentDynamicContext;

async function main() {
  const t0 = Date.now();
  const mastra = await buildMastraInstance({ ctx } as never);
  const subAgents: Record<string, unknown> = {};
  for (const key of SUB_AGENTS) {
    try { subAgents[key] = mastra.getAgent(key); } catch { /* fail-soft, como na rota */ }
  }
  const built = Object.keys(subAgents).length;
  console.log(`sub-agentes: ${built}/${SUB_AGENTS.length}  (${Date.now() - t0}ms)`);

  const supervisor = await buildSupervisorAgent({
    instruction: 'Responda de forma curta e direta.',
    ctx,
    subAgents,
    pagesContext: [],
  });
  console.log(`supervisor: ${supervisor.name}`);

  const t1 = Date.now();
  const res = await supervisor.stream(
    [{ role: 'user', content: 'Responda apenas com a palavra: funcionando.' }] as never,
    { runId: 'smoke-supervisor', maxSteps: 24 } as never,
  );

  let text = '';
  const stream = (res as { fullStream: AsyncIterable<Record<string, unknown>> }).fullStream;
  for await (const chunk of stream) {
    if (chunk.type !== 'text-delta') continue;
    const payload = chunk.payload as Record<string, unknown> | undefined;
    text += String(payload?.text ?? chunk.text ?? '');
  }
  console.log(`stream: ${Date.now() - t1}ms — ${JSON.stringify(text.slice(0, 120))}`);

  const ok = built === SUB_AGENTS.length && text.trim().length > 0;
  console.log(ok ? '\nOK' : '\nFALHOU — veja acima qual etapa não fechou');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
