/**
 * Página 10 do Looker Vila Rosa (Inadimplência) — fonte contratos.
 *
 * `inadimplencia_pct`/`over90_pct` são percentuais-razão 0–1 (decisão #4 do
 * controller) — KPI usa `format:'percent'` (correto, o pipeline já multiplica
 * por 100 na fronteira) + `alertThreshold` na escala pós-conversão (mesmo
 * padrão testado em `inadimplencia.template.mjs`'s `kpi-inadimplencia`) em
 * vez de `gauge` (que NÃO escala o valor e quebraria com threshold 0-100
 * contra um valor bruto 0-1 — ver covenants-v2-visao-executiva.template.mjs).
 *
 * FIX (Task 13 pós-review, autorizado pelo controller): os 3 stacked-bar
 * abaixo eram `kind:'aggregation'` com `groupByAttributes` — formato LONGO,
 * incompatível com stacked-bar (mesmo gap de `rating_serie`). Reescritos
 * como `kind:'sql'` com pivot manual em `scripts/metrics/covenants-v2.mjs`.
 * `BAND2_KEYS` usa os aliases EXATOS da métrica — valores literais de
 * `faixa_atraso_2` confirmados por query real contra
 * `bq-data-wh.vila_rosa_monitor.contratos` (task-13-report.md): "00. Sem
 * atraso", "01. 1 - 30 dias", "02. 31 - 60 dias", "03. 61 - 90 dias",
 * "04. Acima de 90 dias".
 */

function kpi(id, label, description, opts = {}) {
  return {
    id, type: 'kpi', label, value: '—', description, colSpan: opts.colSpan ?? 3,
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.positiveIsGood != null ? { positiveIsGood: opts.positiveIsGood } : {}),
    ...(opts.alertThreshold != null ? { alertThreshold: opts.alertThreshold } : {}),
  };
}

function chart(id, title, chartType, dataKeys, xAxisKey, colSpan, metricId, extra = {}) {
  return {
    id, type: 'chart', chartType, title, data: [], dataKeys, xAxisKey, colSpan,
    ...(metricId ? { metricId } : {}),
    ...(extra.stackOffset ? { stackOffset: extra.stackOffset } : {}),
    ...(extra.layout ? { layout: extra.layout } : {}),
  };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const BAND2_KEYS = ['sem_atraso', 'f1a30', 'f31a60', 'f61a90', 'f90mais'];

const blockMap = {
  'kpi-inadimplencia-pct': kpi('kpi-inadimplencia-pct', 'Inadimplência %', 'Valor em atraso / saldo devedor (snapshot atual)', {
    metricId: 'covenants.inadimplencia_pct', format: 'percent', positiveIsGood: false, alertThreshold: 5,
    // THRESHOLD A CONFIRMAR (spec §9.2)
  }),
  'kpi-over90-pct': kpi('kpi-over90-pct', 'Over 90 %', 'Valor em atraso acima de 90 dias / saldo devedor (snapshot atual)', {
    metricId: 'covenants.over90_pct', format: 'percent', positiveIsGood: false, alertThreshold: 3,
    // THRESHOLD A CONFIRMAR (spec §9.2)
  }),
  'chart-faixa-atraso2-contratos': chart('chart-faixa-atraso2-contratos', 'Nº e % de Contratos por Faixa de Atraso', 'stacked-bar', BAND2_KEYS, 'bucket', 6, 'covenants.faixa_atraso2_contratos_serie', { stackOffset: 'expand', layout: 'horizontal' }),
  'chart-faixa-atraso2-valor': chart('chart-faixa-atraso2-valor', 'Valor do Atraso por Faixa', 'stacked-bar', BAND2_KEYS, 'bucket', 3, 'covenants.faixa_atraso2_valor_serie', { stackOffset: 'expand' }),
  'chart-faixa-atraso2-saldo': chart('chart-faixa-atraso2-saldo', 'Saldo Devedor por Faixa', 'stacked-bar', BAND2_KEYS, 'bucket', 3, 'covenants.faixa_atraso2_saldo_serie', { stackOffset: 'expand' }),
};

const layout = [
  row('row-kpis', ['kpi-inadimplencia-pct', 'kpi-over90-pct']),
  row('row-faixa-contratos', ['chart-faixa-atraso2-contratos']),
  row('row-faixa-valor-saldo', ['chart-faixa-atraso2-valor', 'chart-faixa-atraso2-saldo']),
];

export default {
  id: 'covenants-v2-inadimplencia',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Inadimplência',
  description: 'Inadimplência, over 90 e distribuição de contratos/valor/saldo por faixa de atraso',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'contratos.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'contratos.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.inadimplencia_pct',
    'covenants.over90_pct',
    'covenants.faixa_atraso2_contratos_serie',
    'covenants.faixa_atraso2_valor_serie',
    'covenants.faixa_atraso2_saldo_serie',
  ],
};
