/**
 * Página 9 do Looker Vila Rosa (Perfil da Carteira) — fonte contratos,
 * filtro faixa_atraso_1 não nula.
 *
 * FIX (Task 13 pós-review, autorizado pelo controller): `covenants.
 * rating_serie` era `kind:'aggregation'` com `groupByAttributes` — formato
 * LONGO, incompatível com stacked-bar. Reescrita como `kind:'sql'` com pivot
 * manual (colunas `a`..`h`, uma por rating_liquid) em
 * `scripts/metrics/covenants-v2.mjs`. RATING_KEYS abaixo usa os aliases
 * EXATOS da métrica (letras minúsculas). Validado contra BigQuery real:
 * soma das 8 colunas = 158 = `contratos_ativos` (task-13-report.md).
 * `score_histograma` nunca teve esse problema: `kind:'sql'` com uma única
 * dimensão (`faixa_score`) + `value`, formato correto p/ bar chart simples.
 */

function chart(id, title, chartType, dataKeys, xAxisKey, colSpan, metricId, extra = {}) {
  return {
    id, type: 'chart', chartType, title, data: [], dataKeys, xAxisKey, colSpan,
    ...(metricId ? { metricId } : {}),
    ...(extra.stackOffset ? { stackOffset: extra.stackOffset } : {}),
  };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const RATING_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const blockMap = {
  'chart-rating-serie': chart('chart-rating-serie', 'Distribuição de Contratos por Rating', 'stacked-bar', RATING_KEYS, 'bucket', 6, 'covenants.rating_serie', { stackOffset: 'expand' }),
  'chart-score-histograma': chart('chart-score-histograma', 'Distribuição por Faixa de Score', 'bar', ['value'], 'faixa_score', 6, 'covenants.score_histograma'),
};

const layout = [
  row('row-rating', ['chart-rating-serie']),
  row('row-score', ['chart-score-histograma']),
];

export default {
  id: 'covenants-v2-perfil-carteira',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Perfil da Carteira',
  description: 'Distribuição de contratos por rating Liquid e por faixa de score',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'contratos.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'contratos.data_base_report' },
    },
  },
  metricRefs: ['covenants.rating_serie', 'covenants.score_histograma'],
};
