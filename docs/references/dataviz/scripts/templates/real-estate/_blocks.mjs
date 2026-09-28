/**
 * Construtores de bloco para os templates `imobiliaria-*`.
 *
 * Cada função devolve o objeto que `blockMap` guarda, no shape de
 * `src/shared/config/agents/types.ts` (CanvasBlock). O `id` do bloco é
 * derivado do `metricId` quando não informado. `page()` monta o template
 * inteiro: `blockMap`, `layout` (uma linha por array) e `metricRefs`
 * (todo metricId/sparklineMetricId referenciado), com filtros de página no
 * idioma do app (`snapshot` + `date_range` sobre a foto mensal de estoque —
 * as receitas sobrescrevem a entidade/coluna com `{filter.X:ent.col}`).
 */
const toMetricId = (slug) => `imobiliaria.${slug}`;
const blockIdOf = (slug, prefix) => `${prefix}-${slug.replace(/_/g, '-')}`;

export const kpi = (slug, label, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'kpi'), type: 'kpi', label, value: '—', colSpan: options.colSpan ?? 2, metricId: toMetricId(slug),
  ...(options.description ? { description: options.description } : {}),
  ...(options.format ? { format: options.format } : {}),
  ...(options.suffix ? { suffix: options.suffix } : {}),
  ...(options.decimals != null ? { decimals: options.decimals } : {}),
  ...(options.positiveIsGood != null ? { positiveIsGood: options.positiveIsGood } : {}),
  ...(options.alertThreshold != null ? { alertThreshold: options.alertThreshold } : {}),
  ...(options.spark ? { sparklineMetricId: toMetricId(options.spark) } : {}),
});
export const gauge = (slug, label, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'gauge'), type: 'gauge', label, value: 0, threshold: options.threshold, colSpan: options.colSpan ?? 2, metricId: toMetricId(slug),
  ...(options.warnThreshold != null ? { warnThreshold: options.warnThreshold } : {}),
  ...(options.description ? { description: options.description } : {}),
  ...(options.suffix ? { suffix: options.suffix } : {}),
  ...(options.decimals != null ? { decimals: options.decimals } : {}),
  ...(options.reverseScale != null ? { reverseScale: options.reverseScale } : {}),
  ...(options.format ? { format: options.format } : {}),
});
export const progress = (slug, label, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'progress'), type: 'progress', label, target: options.target ?? 100, decimals: options.decimals ?? 0, colSpan: options.colSpan ?? 2, metricId: toMetricId(slug),
  ...(options.targetLabel ? { targetLabel: options.targetLabel } : {}),
  ...(options.description ? { description: options.description } : {}),
  format: options.format ?? 'percent',
});
export const comparison = (slug, label, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'cmp'), type: 'comparison', label, colSpan: options.colSpan ?? 2, metricId: toMetricId(slug),
  currentLabel: options.currentLabel ?? 'Atual', previousLabel: options.previousLabel ?? 'Anterior', format: options.format ?? 'currency',
  ...(options.positiveIsGood != null ? { positiveIsGood: options.positiveIsGood } : {}),
});
export const targets = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'targets'), type: 'targets', title, items: [], colSpan: options.colSpan ?? 3, metricId: toMetricId(slug),
  display: options.display ?? 'bullet', format: options.format ?? 'currency',
  ...(options.reverseScale != null ? { reverseScale: options.reverseScale } : {}),
});
export const sparkrows = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'spark'), type: 'sparkrows', title, series: [], colSpan: options.colSpan ?? 3, metricId: toMetricId(slug), format: options.format ?? 'number',
});
export const donut = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'donut'), type: 'donut', title, slices: [], colSpan: options.colSpan ?? 2, metricId: toMetricId(slug),
  ...(options.format ? { format: options.format } : {}),
  ...(options.display ? { display: options.display } : {}),
  ...(options.showLegendCards != null ? { showLegendCards: options.showLegendCards } : {}),
});
export const treemap = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'treemap'), type: 'treemap', title, fatias: [], colSpan: options.colSpan ?? 3, metricId: toMetricId(slug), ...(options.format ? { format: options.format } : {}),
});
export const chart = (slug, title, chartType, dataKeys, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'chart'), type: 'chart', chartType, title, data: [], dataKeys, xAxisKey: options.xAxisKey ?? 'bucket', colSpan: options.colSpan ?? 3, metricId: toMetricId(slug),
  ...(options.format ? { format: options.format } : {}),
  ...(options.stackOffset ? { stackOffset: options.stackOffset } : {}),
});
export const scatter = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'scatter'), type: 'scatter', title, points: [], colSpan: options.colSpan ?? 3, metricId: toMetricId(slug),
  ...(options.xLabel ? { xLabel: options.xLabel } : {}), ...(options.yLabel ? { yLabel: options.yLabel } : {}),
  ...(options.xFormat ? { xFormat: options.xFormat } : {}), ...(options.yFormat ? { yFormat: options.yFormat } : {}),
});
export const heatmap = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'heatmap'), type: 'heatmap', title, cells: [], colSpan: options.colSpan ?? 6, metricId: toMetricId(slug),
  ...(options.rowLabel ? { rowLabel: options.rowLabel } : {}), ...(options.colLabel ? { colLabel: options.colLabel } : {}),
  ...(options.format ? { format: options.format } : {}), ...(options.highIsBad != null ? { highIsBad: options.highIsBad } : {}),
});
export const table = (slug, title, columns, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'table'), type: 'table', title, columns, rows: [], colSpan: options.colSpan ?? 6, metricId: toMetricId(slug),
  ...(options.footerAggregations ? { footerAggregations: options.footerAggregations } : {}),
});
export const funnel = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'funnel'), type: 'funnel', title, etapas: [], colSpan: options.colSpan ?? 3, metricId: toMetricId(slug), mostrarConversao: options.mostrarConversao ?? true, format: options.format ?? 'number',
});
export const sankey = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'sankey'), type: 'sankey', title, fluxos: [], colSpan: options.colSpan ?? 3, metricId: toMetricId(slug), ...(options.ordem ? { ordem: options.ordem } : {}), format: options.format ?? 'number',
});
export const boxplot = (slug, title, options = {}) => ({
  id: options.id ?? blockIdOf(slug, 'boxplot'), type: 'boxplot', title, grupos: [], colSpan: options.colSpan ?? 3, metricId: toMetricId(slug), ...(options.format ? { format: options.format } : {}),
});
export const text = (id, content, colSpan = 6) => ({ id, type: 'text', content, colSpan });

/** Coluna de tabela. `format` ∈ currency | percent | number | date | status-badge. */
export const col = (accessorKey, header, format) => ({ header, accessorKey, ...(format ? { format } : {}) });

const DEFAULT_FILTERS = {
  metricPageFilters: {
    snapshot: { kind: 'snapshot', attribute: 'estoque_snapshot.data_base_report' },
    date_range: { kind: 'date_range', attribute: 'estoque_snapshot.data_base_report' },
  },
};

/**
 * Monta o template. `rows` é um array de arrays de blocos; cada array vira
 * uma linha do layout. Ids de linha e `metricRefs` são derivados.
 */
export function page({ id, name, description, rows, filters }) {
  const blockMap = {};
  const layout = [];
  const refs = new Set();
  rows.forEach((blocks, rowIndex) => {
    const ids = [];
    for (const block of blocks) {
      if (blockMap[block.id]) throw new Error(`${id}: bloco duplicado ${block.id}`);
      blockMap[block.id] = block;
      ids.push(block.id);
      if (block.metricId) refs.add(block.metricId);
      if (block.sparklineMetricId) refs.add(block.sparklineMetricId);
    }
    layout.push({ id: `row-${rowIndex + 1}`, blockIds: ids });
  });
  return {
    id, productRefs: ['imobiliaria'], name, description, category: 'Imobiliária', status: 'active',
    blockMap, layout, filters: filters ?? DEFAULT_FILTERS, metricRefs: [...refs],
  };
}
