/**
 * Página 5 do Looker Vila Rosa (Evolução de Obra) — fonte única evolucao_obra.
 *
 * Decisão #4 do controller: previsto/realizado/desvio vêm 0–100 CRU do
 * BigQuery (confirmado em task-11-report.md — obra_previsto_acum=24,82,
 * obra_realizado_acum=22,84, obra_desvio_acum=-1,98, JÁ na escala %). KPIs
 * usam `format:'number'` (não `'percent'`, que multiplicaria por 100 de novo
 * — ver useReportData.ts) com `decimals: 2, suffix: '%'` (Task 13 fix
 * pós-review — antes perdiam casas decimais, ex. "25" em vez de "24,82%").
 *
 * Gauge de desvio acumulado: como o pipeline de gauge NÃO escala o valor
 * (useReportData's branch `gauge` + GaugeBlock.tsx's `formatGaugeValue` —
 * nenhum dos dois multiplica por 100), e a métrica já é 0–100 cru, o gauge
 * funciona corretamente aqui (ao contrário de métricas ratio 0–1 como
 * certidões/inadimplência — ver covenants-v2-visao-executiva.template.mjs).
 * Threshold ilustrativo: desvio < -5% = vermelho (muito atrasado), entre -5
 * e -2% = âmbar, >= -2% = verde. THRESHOLD A CONFIRMAR (spec §9.2).
 *
 * "Barras Total de Evolução de Obra" (MAPEAMENTO §6 pág.5, previsto
 * acumulado × previsto período) NÃO tem metricId no catálogo da Task 11 —
 * o inventário retificado do brief (task-13-brief.md item 4) já reflete essa
 * omissão ("line previsto×realizado + 2 bars de desvio", sem o 3º gráfico) —
 * sigo o brief.
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

function gauge(id, label, opts = {}) {
  return {
    id, type: 'gauge', label, value: 0, threshold: opts.threshold,
    colSpan: opts.colSpan ?? 3,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.warnThreshold != null ? { warnThreshold: opts.warnThreshold } : {}),
    ...(opts.suffix ? { suffix: opts.suffix } : {}),
    ...(opts.decimals != null ? { decimals: opts.decimals } : {}),
    ...(opts.reverseScale != null ? { reverseScale: opts.reverseScale } : {}),
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
  };
}

function chart(id, title, chartType, dataKeys, xAxisKey, colSpan, metricId) {
  return { id, type: 'chart', chartType, title, data: [], dataKeys, xAxisKey, colSpan, ...(metricId ? { metricId } : {}) };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const blockMap = {
  'kpi-obra-previsto-acum': kpi('kpi-obra-previsto-acum', 'Previsto Acumulado (%)', 'Percentual previsto acumulado — 0-100 cru', { metricId: 'covenants.obra_previsto_acum', format: 'number', decimals: 2, suffix: '%' }),
  'kpi-obra-realizado-acum': kpi('kpi-obra-realizado-acum', 'Realizado Acumulado (%)', 'Percentual realizado acumulado — 0-100 cru', { metricId: 'covenants.obra_realizado_acum', format: 'number', decimals: 2, suffix: '%' }),
  'kpi-obra-data-medicao': kpi('kpi-obra-data-medicao', 'Data da Medição', 'Medição física mais recente', { metricId: 'covenants.obra_data_medicao' }),
  'kpi-obra-desvio-acum': kpi('kpi-obra-desvio-acum', 'Desvio Acumulado (%)', 'Realizado menos previsto — 0-100 cru', { metricId: 'covenants.obra_desvio_acum', format: 'number', decimals: 2, suffix: '%', colSpan: 3 }),
  'gauge-obra-desvio': gauge('gauge-obra-desvio', 'Status do Desvio de Obra', {
    threshold: -5, warnThreshold: -2, suffix: '%', decimals: 2,
    metricId: 'covenants.obra_desvio_acum', colSpan: 3,
    // THRESHOLD A CONFIRMAR com o contrato do Inter (spec §9.2)
  }),
  'chart-obra-serie': chart('chart-obra-serie', 'Evolução de Obra no Tempo', 'line', ['previsto_acumulado', 'realizado_acumulado'], 'bucket', 6, 'covenants.obra_serie'),
  'chart-desvio-periodo': chart('chart-desvio-periodo', 'Desvio no Período', 'bar', ['value'], 'bucket', 3, 'covenants.obra_desvio_periodo_serie'),
  'chart-desvio-acum': chart('chart-desvio-acum', 'Desvio Acumulado', 'bar', ['value'], 'bucket', 3, 'covenants.obra_desvio_acum_serie'),
};

const layout = [
  row('row-kpis', ['kpi-obra-previsto-acum', 'kpi-obra-realizado-acum', 'kpi-obra-data-medicao']),
  row('row-desvio-status', ['kpi-obra-desvio-acum', 'gauge-obra-desvio']),
  row('row-obra-serie', ['chart-obra-serie']),
  row('row-desvio-series', ['chart-desvio-periodo', 'chart-desvio-acum']),
];

export default {
  id: 'covenants-v2-evolucao-obra',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Evolução de Obra',
  description: 'Evolução física da obra: previsto × realizado, desvios no período e acumulado',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'evolucao_obra.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'evolucao_obra.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.obra_previsto_acum',
    'covenants.obra_realizado_acum',
    'covenants.obra_data_medicao',
    'covenants.obra_desvio_acum',
    'covenants.obra_serie',
    'covenants.obra_desvio_periodo_serie',
    'covenants.obra_desvio_acum_serie',
  ],
};
