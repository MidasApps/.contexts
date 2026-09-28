/**
 * Página 4 do Looker Vila Rosa (Unidades Comercializadas & Estoque).
 *
 * "Linha dupla — Evolução de Vendas no Tempo" (MAPEAMENTO): as duas séries
 * (unidades_vendidas_acum, velocidade_venda) são metricIds SEPARADOS (Task
 * 11) — cada chart block só liga a UM metricId (useReportData resolve
 * blockId→metricId 1:1). Renderizo como 2 gráficos de linha lado a lado
 * (mesmo padrão já usado em inadimplencia.template.mjs's row-faixa-series,
 * que também junta métricas relacionadas em blocos separados) em vez de 1
 * gráfico com 2 séries.
 */

function kpi(id, label, description, opts = {}) {
  return {
    id, type: 'kpi', label, value: '—', description, colSpan: opts.colSpan ?? 3,
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
    ...(opts.format ? { format: opts.format } : {}),
  };
}

function chart(id, title, chartType, dataKeys, xAxisKey, colSpan, metricId) {
  return { id, type: 'chart', chartType, title, data: [], dataKeys, xAxisKey, colSpan, ...(metricId ? { metricId } : {}) };
}

function text(id, content, colSpan = 6) {
  return { id, type: 'text', content, colSpan };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const blockMap = {
  'kpi-vuv3-m2': kpi('kpi-vuv3-m2', 'VUV3 / m²', 'Valor unitário ajustado — últimas 3 vendas', { metricId: 'covenants.vuv3_m2', format: 'currency' }),
  'kpi-vuva-m2': kpi('kpi-vuva-m2', 'VUVA / m²', 'Valor unitário ajustado — avaliação', { metricId: 'covenants.vuva_m2', format: 'currency' }),
  'kpi-vuv3-estoque': kpi('kpi-vuv3-estoque', 'VUV3 Estoque', 'Valor do estoque pelo VUV3', { metricId: 'covenants.vuv3_estoque', format: 'currency' }),
  'kpi-vuva-estoque': kpi('kpi-vuva-estoque', 'VUVA Estoque', 'Valor do estoque pelo VUVA', { metricId: 'covenants.vuva_estoque', format: 'currency' }),
  'text-vuv-nota': text('text-vuv-nota', '_VUV3 = valor unitário ajustado pelas últimas 3 vendas. VUVA = valor unitário ajustado pela avaliação (laudo). Ambos usados para precificar o estoque remanescente._'),
  'chart-unidades-vendidas-acum': chart('chart-unidades-vendidas-acum', 'Unidades Vendidas (Acumulado)', 'line', ['value'], 'bucket', 3, 'covenants.unidades_vendidas_acum'),
  'chart-velocidade-venda': chart('chart-velocidade-venda', 'Velocidade de Venda (Mensal)', 'line', ['value'], 'bucket', 3, 'covenants.velocidade_venda'),
  'chart-vuv-serie': chart('chart-vuv-serie', 'Evolução do VUV', 'bar', ['vuv3_m2', 'vuva_m2'], 'bucket', 6, 'covenants.vuv_serie'),
};

const layout = [
  row('row-vuv-kpis-1', ['kpi-vuv3-m2', 'kpi-vuva-m2']),
  row('row-vuv-kpis-2', ['kpi-vuv3-estoque', 'kpi-vuva-estoque']),
  row('row-vuv-nota', ['text-vuv-nota']),
  row('row-vendas-serie', ['chart-unidades-vendidas-acum', 'chart-velocidade-venda']),
  row('row-vuv-serie', ['chart-vuv-serie']),
];

export default {
  id: 'covenants-v2-unidades',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Unidades',
  description: 'VUV3/VUVA, estoque e evolução histórica de vendas por unidade',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'covenants_calculo.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'covenants_calculo.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.vuv3_m2',
    'covenants.vuva_m2',
    'covenants.vuv3_estoque',
    'covenants.vuva_estoque',
    'covenants.unidades_vendidas_acum',
    'covenants.velocidade_venda',
    'covenants.vuv_serie',
  ],
};
