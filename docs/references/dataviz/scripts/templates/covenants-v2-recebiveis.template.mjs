/**
 * Página 7 do Looker Vila Rosa (Recebíveis Pré/Pós-Chaves).
 *
 * FIX (Task 13 pós-review, autorizado pelo controller): `covenants.
 * recebiveis_por_inadimplencia` fazia GROUP BY tipo_recebivel, faixa_atraso_1
 * sem pivot — formato LONGO, incompatível com stacked-bar. Reescrita como
 * `kind:'sql'` com pivot manual (6 colunas de faixa_atraso_1) em
 * `scripts/metrics/covenants-v2.mjs` — agora 1 linha por tipo_recebivel
 * (2 linhas: Pré-chaves/Pós-chaves), 1 coluna por faixa. Validado contra
 * BigQuery real: soma das 6 colunas por tipo bate exato com os totais de
 * referência do task-11-report (Pré=15.015.218,05, Pós=70.746.923,26 — ver
 * task-13-report.md). A tabela-pivot abaixo usa a MESMA métrica, agora
 * também no formato largo (colunas por faixa em vez de linha por faixa).
 */

function kpi(id, label, description, opts = {}) {
  return {
    id, type: 'kpi', label, value: '—', description, colSpan: opts.colSpan ?? 2,
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.decimals != null ? { decimals: opts.decimals } : {}),
    ...(opts.suffix ? { suffix: opts.suffix } : {}),
  };
}

function donut(id, title, opts = {}) {
  return {
    id, type: 'donut', title, slices: [], colSpan: opts.colSpan ?? 2,
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.showLegendCards != null ? { showLegendCards: opts.showLegendCards } : {}),
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
  };
}

function chart(id, title, chartType, dataKeys, xAxisKey, colSpan, metricId, extra = {}) {
  return {
    id, type: 'chart', chartType, title, data: [], dataKeys, xAxisKey, colSpan,
    ...(metricId ? { metricId } : {}),
    ...(extra.stackOffset ? { stackOffset: extra.stackOffset } : {}),
  };
}

function table(id, title, columns, colSpan, metricId) {
  return { id, type: 'table', title, columns, rows: [], colSpan, ...(metricId ? { metricId } : {}) };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const blockMap = {
  'donut-recebiveis': donut('donut-recebiveis', 'Total de Recebíveis', {
    format: 'currency', showLegendCards: true, metricId: 'covenants.recebiveis_pre_pos_snapshot', colSpan: 2,
  }),
  // vuv3_m2 exibido como 'currency' — é um valor em R$/m², não um índice.
  'kpi-vuv3-m2': kpi('kpi-vuv3-m2', 'VUV3 / m²', 'Valor unitário ajustado — últimas 3 vendas', { metricId: 'covenants.vuv3_m2', format: 'currency', colSpan: 2 }),
  // indice_recebivel_estoque é um índice adimensional (14,64), não um %
  // — decimals:2 sem suffix (Task 13 fix pós-review).
  'kpi-indice-recebivel-estoque': kpi('kpi-indice-recebivel-estoque', 'Pós-chaves + Estoque', 'Índice recebível considerando estoque remanescente', { metricId: 'covenants.indice_recebivel_estoque', format: 'number', decimals: 2, colSpan: 2 }),
  'chart-recebiveis-por-inadimplencia': chart('chart-recebiveis-por-inadimplencia', 'Recebíveis por Inadimplência', 'stacked-bar', ['sem_atraso', 'f1a5', 'f6a30', 'f30a60', 'f60a90', 'f90mais'], 'tipo_recebivel', 6, 'covenants.recebiveis_por_inadimplencia', { stackOffset: 'expand' }),
  'table-recebiveis-pivot': table('table-recebiveis-pivot', 'Recebíveis por Inadimplência (detalhado)', [
    { header: 'Tipo Recebível', accessorKey: 'tipo_recebivel' },
    { header: 'Sem Atraso', accessorKey: 'sem_atraso', format: 'currency' },
    { header: '1-5 dias', accessorKey: 'f1a5', format: 'currency' },
    { header: '6-30 dias', accessorKey: 'f6a30', format: 'currency' },
    { header: '30-60 dias', accessorKey: 'f30a60', format: 'currency' },
    { header: '60-90 dias', accessorKey: 'f60a90', format: 'currency' },
    { header: 'Acima de 90 dias', accessorKey: 'f90mais', format: 'currency' },
  ], 6, 'covenants.recebiveis_por_inadimplencia'),
};

const layout = [
  row('row-kpis', ['donut-recebiveis', 'kpi-vuv3-m2', 'kpi-indice-recebivel-estoque']),
  row('row-stacked', ['chart-recebiveis-por-inadimplencia']),
  row('row-pivot', ['table-recebiveis-pivot']),
];

export default {
  id: 'covenants-v2-recebiveis',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Recebíveis',
  description: 'Recebíveis pré/pós-chaves e distribuição por faixa de inadimplência',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'covenants_calculo.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'covenants_calculo.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.recebiveis_pre_pos_snapshot',
    'covenants.vuv3_m2',
    'covenants.indice_recebivel_estoque',
    'covenants.recebiveis_por_inadimplencia',
  ],
};
