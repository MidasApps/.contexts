/**
 * Página 11 do Looker Vila Rosa (Fluxo de Caixa — Ajustado ao Risco).
 * Invariante de validação (MAPEAMENTO §9): fluxo_contratado >= fluxo_esperado
 * em todos os meses (gap = haircut de risco).
 *
 * FIX (Task 13 pós-review, autorizado pelo controller): `covenants.
 * fluxo_por_faixa_serie` fazia GROUP BY bucket, faixa_atraso_1 sem pivot —
 * formato LONGO, incompatível com stacked-bar. Reescrita como `kind:'sql'`
 * com pivot manual (6 colunas de faixa_atraso_1) em
 * `scripts/metrics/covenants-v2.mjs`. FAIXA1_KEYS usa os aliases EXATOS da
 * métrica — valores literais de faixa_atraso_1 confirmados por query real
 * (task-13-report.md): "00. Sem atraso", "01. 1 - 5 dias", "02. 6 - 30
 * dias", "03. 30 - 60 dias", "04. 60 - 90 dias", "05. Acima de 90 dias".
 */

function table(id, title, columns, colSpan, metricId) {
  return { id, type: 'table', title, columns, rows: [], colSpan, ...(metricId ? { metricId } : {}) };
}

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

const BAND1_KEYS = ['sem_atraso', 'f1a5', 'f6a30', 'f30a60', 'f60a90', 'f90mais'];

const blockMap = {
  'table-fluxo-projetado': table('table-fluxo-projetado', 'Fluxo de Caixa Projetado', [
    { header: 'Mês', accessorKey: 'bucket', format: 'date' },
    { header: 'Fluxo Esperado', accessorKey: 'fluxo_esperado', format: 'currency' },
    { header: 'Fluxo Contratado', accessorKey: 'fluxo_contratado', format: 'currency' },
  ], 6, 'covenants.fluxo_projetado_table'),
  'chart-fluxo-projetado-serie': chart('chart-fluxo-projetado-serie', 'Fluxo de Parcela Ajustada ao Risco', 'composed', ['fluxo_esperado', 'fluxo_contratado'], 'bucket', 6, 'covenants.fluxo_projetado_serie'),
  'chart-fluxo-por-faixa': chart('chart-fluxo-por-faixa', 'Fluxo de Caixa por Faixa de Inadimplência', 'stacked-bar', BAND1_KEYS, 'bucket', 6, 'covenants.fluxo_por_faixa_serie', { stackOffset: 'expand' }),
};

const layout = [
  row('row-tabela', ['table-fluxo-projetado']),
  row('row-combo', ['chart-fluxo-projetado-serie']),
  row('row-faixa', ['chart-fluxo-por-faixa']),
];

export default {
  id: 'covenants-v2-fluxo-caixa',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Fluxo de Caixa',
  description: 'Projeção de fluxo de caixa ajustada ao risco (esperado × contratado) e por faixa de inadimplência',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'fluxo_caixa.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'fluxo_caixa.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.fluxo_projetado_table',
    'covenants.fluxo_projetado_serie',
    'covenants.fluxo_por_faixa_serie',
  ],
};
