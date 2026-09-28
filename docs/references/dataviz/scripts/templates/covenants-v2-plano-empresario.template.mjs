/**
 * Página 8 do Looker Vila Rosa (Plano Empresário).
 *
 * Não existe metricId de razão "dívida/limite" no catálogo da Task 11 (só
 * valor/contratado/dívida/série, cada um isolado). Em vez de inventar uma
 * métrica nova, o gauge liga direto em `plano_empresario_divida` (moeda) com
 * threshold ILUSTRATIVO em moeda também (~ o valor de `plano_empresario_
 * valor`, R$45mi) — evita o bug de escala de gauges percent (ver
 * covenants-v2-visao-executiva.template.mjs) porque aqui não há conversão
 * percentual nenhuma envolvida, só duas grandezas em BRL.
 */

function kpi(id, label, description, opts = {}) {
  return {
    id, type: 'kpi', label, value: '—', description, colSpan: opts.colSpan ?? 3,
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.positiveIsGood != null ? { positiveIsGood: opts.positiveIsGood } : {}),
  };
}

function gauge(id, label, opts = {}) {
  return {
    id, type: 'gauge', label, value: 0, threshold: opts.threshold,
    colSpan: opts.colSpan ?? 3,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.warnThreshold != null ? { warnThreshold: opts.warnThreshold } : {}),
    ...(opts.reverseScale != null ? { reverseScale: opts.reverseScale } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.suffix ? { suffix: opts.suffix } : {}),
    ...(opts.decimals != null ? { decimals: opts.decimals } : {}),
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
  'kpi-pe-valor': kpi('kpi-pe-valor', 'Plano Empresário Valor', 'Limite total contratado com o banco (ficha cadastral)', { metricId: 'covenants.plano_empresario_valor', format: 'currency', colSpan: 3 }),
  'kpi-pe-contratado': kpi('kpi-pe-contratado', 'Plano Empresário Contratado', 'Valor já contratado/liberado até o snapshot atual', { metricId: 'covenants.plano_empresario_contratado', format: 'currency', colSpan: 3 }),
  'kpi-pe-divida': kpi('kpi-pe-divida', 'Dívida Atual', 'Saldo devedor atual do plano empresário', { metricId: 'covenants.plano_empresario_divida', format: 'currency', positiveIsGood: false, colSpan: 3 }),
  /*
   * Dívida em % do valor do plano, com o teto em 100%: o limite vem do dado de
   * cada empreendimento, não de uma constante. O limite ilustrativo de R$ 45 mi
   * mostrava "folga" com a dívida acima do plano do projeto.
   * ⚠️ O covenant contratual pode ser mais baixo que 100% — A CONFIRMAR com o
   * contrato do Inter (spec §9.2); quando vier, ajuste `threshold`.
   */
  'gauge-pe-divida-limite': gauge('gauge-pe-divida-limite', 'Dívida sobre o Plano Empresário', {
    threshold: 100, suffix: '%', decimals: 1, reverseScale: true, metricId: 'covenants.plano_empresario_uso_pct', colSpan: 3,
    description: 'Saldo devedor sobre o valor do plano (ficha cadastral). 100% = plano esgotado.',
  }),
  'chart-pe-evolucao': chart('chart-pe-evolucao', 'Evolução do Plano Empresário', 'bar', ['contratado', 'divida_atual'], 'bucket', 6, 'covenants.plano_empresario_serie'),
};

const layout = [
  row('row-kpis', ['kpi-pe-valor', 'kpi-pe-contratado']),
  row('row-divida-gauge', ['kpi-pe-divida', 'gauge-pe-divida-limite']),
  row('row-serie', ['chart-pe-evolucao']),
];

export default {
  id: 'covenants-v2-plano-empresario',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Plano Empresário',
  description: 'Valor contratado, dívida atual e evolução do plano empresário (financiamento à produção)',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'evolucao_plano_empresario.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'evolucao_plano_empresario.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.plano_empresario_valor',
    'covenants.plano_empresario_contratado',
    'covenants.plano_empresario_divida',
    'covenants.plano_empresario_serie',
  ],
};
