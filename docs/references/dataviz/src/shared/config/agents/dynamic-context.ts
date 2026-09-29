import type { AgentDynamicContext } from './types';
import {
  buildDynamicFilterContext,
  renderMetricCatalogSection,
  renderSemanticContextSections,
} from './shared-context';

// As páginas fixas do Play saíram com a purga; o que resta são os reports
// dinâmicos (`/g/...`), cujo rótulo não cabe num mapa estático — para eles o
// fallback abaixo usa o próprio path.
const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Início',
};

function hasIndicators(dashboardState?: string): boolean {
  return !!dashboardState && dashboardState.trim().length > 0 && !dashboardState.includes('Nenhum indicador carregado');
}

/** Contexto dinâmico por request, anexado por baixo da instrução (config). Sub-agentes. */
export function buildAgentDynamicContext(ctx: AgentDynamicContext): string {
  const parts: string[] = [buildDynamicFilterContext(ctx)];
  const semantic = renderSemanticContextSections(ctx.semanticContext);
  if (semantic) parts.push(semantic);
  if (hasIndicators(ctx.dashboardState)) {
    parts.push(
      `## Estado atual do dashboard\n\n${ctx.dashboardState}\n\n> Os indicadores acima já estão visíveis na tela do usuário. Responda DIRETAMENTE usando esses dados quando suficientes. Só consulte o BigQuery se precisar de dados que NÃO estão nos indicadores acima.`,
    );
  }
  return parts.join('\n\n');
}

/** Contexto dinâmico do supervisor (página/foco/indicadores). Extraído do orchestrator.ts. */
export function buildOrchestratorDynamicContext(ctx: AgentDynamicContext): string {
  const parts: string[] = [];
  const pageLabel = PAGE_LABELS[ctx.page] ?? ctx.page;
  parts.push(`## Contexto da sessão\n\nO usuário está na página **"${pageLabel}"** (${ctx.page}).`);
  if (!ctx.focusedIndicator) {
    parts.push(`> Quando o usuário fizer perguntas genéricas como "qual a tendência?", "por que subiu?", assuma que se refere aos indicadores visíveis nesta página.`);
  }
  if (ctx.focusedIndicator) {
    parts.push(
      `## Indicador em foco (PRIORIDADE)\n\nO usuário está visualizando o indicador **"${ctx.focusedIndicator.name}"**${ctx.focusedIndicator.value ? ` (valor atual: ${ctx.focusedIndicator.value})` : ''}.\n${ctx.focusedIndicator.history ? `Histórico: ${ctx.focusedIndicator.history}` : ''}\n\n> **Regra:** Quando o usuário fizer perguntas genéricas como "projete os próximos 6 meses", "qual a tendência?", "por que caiu?", etc., assuma que está se referindo a este indicador. Passe o nome do indicador explicitamente na query do agente. Nunca pergunte ao usuário qual indicador ele quer — use este.`,
    );
  }
  // O catálogo de métricas é a paleta de construção do supervisor — sem ele não
  // há de onde tirar um `metricId` para o bloco. Ver `renderMetricCatalogSection`.
  const catalog = renderMetricCatalogSection(ctx.semanticContext);
  if (catalog) parts.push(catalog);
  if (hasIndicators(ctx.dashboardState)) {
    parts.push(`## Indicadores disponíveis no dashboard (já carregados)\n\n${ctx.dashboardState}\n\n> Os indicadores acima já estão visíveis na tela do usuário. Use o **descriptive_agent** para responder perguntas que podem ser respondidas com esses dados. Só use agentes analíticos se o usuário precisar de dados que NÃO estão nos indicadores acima.`);
  } else {
    parts.push(`## Indicadores disponíveis no dashboard\n\n> Nenhum indicador carregado ainda. Use o **descriptive_agent** para consultar dados.`);
  }
  return parts.join('\n\n');
}
