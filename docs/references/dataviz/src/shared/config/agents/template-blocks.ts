import type { CanvasBlock } from './types';
import { normalizeWidth } from '@/features/report-authoring/schema/block-specs';

/**
 * Tipos que a paleta manual oferece.
 *
 * Eram quatro — kpi, chart, table, text — enquanto `gauge` e `donut`
 * renderizavam em produção e tinham tool de IA. O efeito é que dois formatos
 * (covenant e composição), justamente os do assunto do produto, só existiam se
 * o assistente os criasse: pela mão, eram inalcançáveis. Bloco que renderiza e
 * não está aqui é bloco invisível para quem edita.
 */
/**
 * A lista existe em RUNTIME, e o tipo deriva dela — não o contrário.
 *
 * Como união de tipos ela era invisível para quem precisa percorrer os tipos:
 * qualquer teste ou varredura teria que repetir os dezesseis nomes à mão, e
 * uma segunda lista da mesma decisão diverge da primeira no dia em que alguém
 * acrescentar um bloco. É o mesmo motivo que fez `heightFamily` sair do
 * `block-shell` e virar campo do contrato.
 */
export const PALETTE_TYPES = [
  'kpi', 'gauge', 'progress', 'comparison',
  'chart', 'donut', 'scatter', 'heatmap',
  'targets', 'sparkrows',
  'funnel', 'sankey', 'boxplot', 'treemap',
  'table', 'text',
] as const;

export type PaletteBlockType = typeof PALETTE_TYPES[number];

/**
 * Cria um bloco vazio com defaults sensatos para o autorador de templates.
 *
 * A largura NÃO é escrita à mão: sai de `normalizeWidth`, que é a mesma
 * função que as tools da IA usam. Antes cada `case` tinha um número literal, e
 * eles já haviam divergido do contrato — o chart nascia em 3 enquanto o spec
 * recomendava 6 para os tipos com legenda.
 */
export function makeEmptyBlock(type: PaletteBlockType): CanvasBlock {
  const id = crypto.randomUUID();
  const colSpan = normalizeWidth(type, undefined) as CanvasBlock['colSpan'];

  switch (type) {
    case 'kpi':
      return { id, type: 'kpi', label: 'Novo KPI', value: '—', colSpan };
    case 'gauge':
      // `value: 0` como nos templates — quem preenche é o pipeline. O limite
      // nasce em 1 e não em 0: com limite zero não há escala nem folga.
      return { id, type: 'gauge', label: 'Novo indicador', value: 0, threshold: 1, colSpan };
    case 'progress':
      return { id, type: 'progress', label: 'Novo progresso', target: 100, colSpan };
    case 'comparison':
      return { id, type: 'comparison', label: 'Nova comparação', colSpan };
    case 'chart':
      return { id, type: 'chart', chartType: 'bar', title: 'Novo gráfico', data: [], dataKeys: ['value'], xAxisKey: 'name', colSpan };
    case 'donut':
      return { id, type: 'donut', title: 'Nova composição', slices: [], colSpan };
    case 'scatter':
      return { id, type: 'scatter', title: 'Nova dispersão', points: [], colSpan };
    case 'heatmap':
      return { id, type: 'heatmap', title: 'Nova matriz', cells: [], colSpan };
    case 'targets':
      return { id, type: 'targets', title: 'Novos indicadores com meta', items: [], colSpan };
    case 'sparkrows':
      return { id, type: 'sparkrows', title: 'Nova tendência', series: [], colSpan };
    case 'funnel':
      return { id, type: 'funnel', title: 'Novo funil', etapas: [], colSpan };
    case 'sankey':
      return { id, type: 'sankey', title: 'Nova matriz de migração', fluxos: [], colSpan };
    case 'boxplot':
      return { id, type: 'boxplot', title: 'Nova dispersão por grupo', grupos: [], colSpan };
    case 'treemap':
      return { id, type: 'treemap', title: 'Novo peso por área', fatias: [], colSpan };
    case 'table':
      return { id, type: 'table', title: 'Nova tabela', columns: [{ header: 'Coluna', accessorKey: 'coluna' }], rows: [], colSpan };
    case 'text':
      return { id, type: 'text', content: '### Título', colSpan };
  }
}

/** Extrai os metricId únicos presentes nos blocos (single source of truth de metricRefs). */
export function deriveMetricRefs(blockMap: Record<string, CanvasBlock>): string[] {
  const set = new Set<string>();
  for (const block of Object.values(blockMap)) {
    const metricId = (block as { metricId?: string }).metricId;
    if (metricId) set.add(metricId);
  }
  return Array.from(set);
}
