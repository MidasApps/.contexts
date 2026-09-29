/**
 * Página 2 do Looker Vila Rosa (visão executiva) + melhorias v2 (gauges de
 * enquadramento). Helpers idênticos aos de inadimplencia.template.mjs.
 *
 * Correções em relação ao exemplo literal do brief (task-13-brief.md):
 * - Donut usa `covenants.recebiveis_pre_pos_snapshot` (NUNCA
 *   `covenants.recebiveis_pre_pos`, que é a métrica global pré-existente do
 *   Galli — ver task-11-report.md "Fix pós-review").
 * - `gauge-certidoes` (certidoes_validas_pct, ratio 0–1) foi substituído por
 *   um KPI `format:'percent'`: o pipeline de gauge (`useReportData`'s branch
 *   `type==='gauge'` + `GaugeBlock.tsx`'s `formatGaugeValue`) NUNCA multiplica
 *   por 100 — nem no valor usado por `classify()` (threshold), nem no
 *   display — diferente do KPI/Table que fazem `value*100` na fronteira
 *   (useReportData.ts:33-34). Um gauge com threshold:80/warnThreshold:90
 *   ligado a uma métrica 0–1 classificaria SEMPRE como vermelho (0,83 < 80).
 *   `indice_recebivel`/`indice_recebivel_estoque` continuam como gauge
 *   porque são índices "x" já na mesma escala do threshold (sem conversão
 *   nenhuma envolvida — ver GaugeBlock.tsx:56).
 * - `chart-saldo-pe` usa dataKeys ['divida_atual'] (não ['value']): o
 *   metricId `plano_empresario_serie` retorna `{bucket, contratado,
 *   divida_atual}` (2 colunas nomeadas, sem coluna `value`) — MAPEAMENTO
 *   pág.2 só pede a linha de saldo devedor (divida_atual) aqui.
 * - `table-faixa-atraso` usa accessorKey `faixa_atraso_1` (a métrica
 *   `covenants.faixa_atraso_table` aliasa a coluna assim, não `faixa_atraso`).
 * - `table-recebimentos` usa accessorKey `banco`/`conta_codigo` (as colunas
 *   reais de `covenants.recebimentos_periodo`, não `nome_reduzido`/`conta`).
 * - Layout: linha `row-recebiveis` do brief somava colSpan 2+2+4=8 (>6,
 *   grid de 6 colunas) — separei a tabela em linha própria (`row-faixa-table`).
 *
 * FIX (Task 13 pós-review, autorizado pelo controller): `covenants.
 * extrato_resumido` aliasava a categoria macro `AS categoria` — `toWaterfallData`
 * (src/pages/explore/ui/blocks/waterfall.ts:4) lê `r.bucket` literal, então o
 * eixo X do waterfall ficava sem rótulo. Recipe corrigida para
 * `AS bucket` (mesmo agrupamento/valores, só o alias mudou) em
 * `scripts/metrics/covenants-v2.mjs`.
 */

function kpi(id, label, description, opts = {}) {
  return {
    id, type: 'kpi', label, value: '—', description, colSpan: opts.colSpan ?? 2,
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.positiveIsGood != null ? { positiveIsGood: opts.positiveIsGood } : {}),
    ...(opts.alertThreshold != null ? { alertThreshold: opts.alertThreshold } : {}),
  };
}

function gauge(id, label, opts = {}) {
  return {
    id, type: 'gauge', label, value: 0, threshold: opts.threshold,
    colSpan: opts.colSpan ?? 2,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.warnThreshold != null ? { warnThreshold: opts.warnThreshold } : {}),
    ...(opts.suffix ? { suffix: opts.suffix } : {}),
    ...(opts.decimals != null ? { decimals: opts.decimals } : {}),
    ...(opts.reverseScale != null ? { reverseScale: opts.reverseScale } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
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

function donut(id, title, opts = {}) {
  return {
    id, type: 'donut', title, slices: [], colSpan: opts.colSpan ?? 2,
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.showLegendCards != null ? { showLegendCards: opts.showLegendCards } : {}),
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
  };
}

function table(id, title, columns, colSpan, metricId, extra = {}) {
  return {
    id, type: 'table', title, columns, rows: [], colSpan,
    ...(metricId ? { metricId } : {}),
    ...(extra.footerAggregations ? { footerAggregations: extra.footerAggregations } : {}),
  };
}

function text(id, content, colSpan = 2) {
  return { id, type: 'text', content, colSpan };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const blockMap = {
  'gauge-indice-recebivel': gauge('gauge-indice-recebivel', 'Índice Recebível', {
    threshold: 1.2, warnThreshold: 1.5, suffix: 'x', decimals: 2,
    metricId: 'covenants.indice_recebivel', colSpan: 2,
    // THRESHOLD A CONFIRMAR com o contrato do Inter (spec §9.2)
  }),
  'gauge-pos-chaves-estoque': gauge('gauge-pos-chaves-estoque', 'Pós-chaves + Estoque', {
    threshold: 1.2, warnThreshold: 1.5, suffix: 'x', decimals: 2,
    metricId: 'covenants.indice_recebivel_estoque', colSpan: 2,
    // THRESHOLD A CONFIRMAR com o contrato do Inter (spec §9.2)
  }),
  'kpi-certidoes-validas': kpi('kpi-certidoes-validas', 'Percentual de Certidões Válidas', 'Certidões com status Válida sobre o total (snapshot atual)', {
    metricId: 'covenants.certidoes_validas_pct', format: 'percent', colSpan: 2,
  }),
  'chart-saldo-pe': chart('chart-saldo-pe', 'Saldo Devedor (Plano Empresário)', 'line', ['divida_atual'], 'bucket', 3, 'covenants.plano_empresario_serie'),
  'chart-inadimplencia': chart('chart-inadimplencia', 'Inadimplência', 'line', ['value'], 'bucket', 3, 'covenants.inadimplencia_serie'),
  'kpi-pe-valor': kpi('kpi-pe-valor', 'Plano Empresário Valor', 'Limite contratado com o banco', { metricId: 'covenants.plano_empresario_valor', format: 'currency', colSpan: 2 }),
  'kpi-pe-contratado': kpi('kpi-pe-contratado', 'Plano Empresário Contratado', 'Valor já contratado', { metricId: 'covenants.plano_empresario_contratado', format: 'currency', colSpan: 2 }),
  'kpi-pe-divida': kpi('kpi-pe-divida', 'Dívida Atual', 'Saldo devedor do plano empresário', { metricId: 'covenants.plano_empresario_divida', format: 'currency', colSpan: 2, positiveIsGood: false }),
  'kpi-contratos-total': kpi('kpi-contratos-total', 'Contratos Comercializados', 'Total histórico', { metricId: 'covenants.contratos_total', format: 'number', colSpan: 3 }),
  'kpi-contratos-ativos': kpi('kpi-contratos-ativos', 'Contratos Ativos', '', { metricId: 'covenants.contratos_ativos', format: 'number', colSpan: 3 }),
  'kpi-contratos-quitados': kpi('kpi-contratos-quitados', 'Contratos Quitados', '', { metricId: 'covenants.contratos_quitados', format: 'number', colSpan: 3 }),
  'kpi-contratos-distratados': kpi('kpi-contratos-distratados', 'Contratos Distratados', '', { metricId: 'covenants.contratos_distratados', format: 'number', colSpan: 3, positiveIsGood: false }),
  'donut-recebiveis': donut('donut-recebiveis', 'Total de Recebíveis', {
    format: 'currency', showLegendCards: true, metricId: 'covenants.recebiveis_pre_pos_snapshot', colSpan: 3,
  }),
  'text-nota-recebiveis': text('text-nota-recebiveis', '_O Total de Recebíveis considera apenas os valores com vencimento futuro, excluindo os valores em atraso e as correções._', 3),
  'table-faixa-atraso': table('table-faixa-atraso', 'Faixa de Atraso', [
    { header: 'Faixa Atraso', accessorKey: 'faixa_atraso_1' },
    { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
    { header: 'Saldo Devedor', accessorKey: 'saldo_devedor', format: 'currency' },
    { header: 'Valor Atraso', accessorKey: 'valor_atraso', format: 'currency' },
    { header: 'Inadimplência %', accessorKey: 'inadimplencia_pct', format: 'percent' },
  ], 6, 'covenants.faixa_atraso_table', {
    footerAggregations: { faixa_atraso_1: 'Total geral', contratos: 'sum', saldo_devedor: 'sum', valor_atraso: 'sum' },
  }),
  'table-recebimentos': table('table-recebimentos', 'Recebimentos no Período', [
    { header: 'Banco', accessorKey: 'banco' },
    { header: 'Conta', accessorKey: 'conta_codigo' },
    { header: 'Valor', accessorKey: 'value', format: 'currency' },
  ], 2, 'covenants.recebimentos_periodo'),
  'chart-extrato-resumido': chart('chart-extrato-resumido', 'Extrato Resumido', 'waterfall', ['value'], 'bucket', 2, 'covenants.extrato_resumido'),
  'chart-entradas-saidas': chart('chart-entradas-saidas', 'Entradas & Saídas', 'bar', ['credit', 'debit'], 'bucket', 2, 'covenants.transacoes_por_tipo_serie'),
};

const layout = [
  row('row-gauges', ['gauge-indice-recebivel', 'gauge-pos-chaves-estoque', 'kpi-certidoes-validas']),
  row('row-series', ['chart-saldo-pe', 'chart-inadimplencia']),
  row('row-pe', ['kpi-pe-valor', 'kpi-pe-contratado', 'kpi-pe-divida']),
  row('row-status-1', ['kpi-contratos-total', 'kpi-contratos-ativos']),
  row('row-status-2', ['kpi-contratos-quitados', 'kpi-contratos-distratados']),
  row('row-recebiveis', ['donut-recebiveis', 'text-nota-recebiveis']),
  row('row-faixa-table', ['table-faixa-atraso']),
  row('row-extrato', ['table-recebimentos', 'chart-extrato-resumido', 'chart-entradas-saidas']),
];

export default {
  id: 'covenants-v2-visao-executiva',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Visão Executiva',
  description: 'Visão executiva dos covenants (índices, plano empresário, inadimplência, recebíveis e extrato) com status de enquadramento',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'covenants_calculo.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'covenants_calculo.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.indice_recebivel',
    'covenants.indice_recebivel_estoque',
    'covenants.certidoes_validas_pct',
    'covenants.plano_empresario_serie',
    'covenants.inadimplencia_serie',
    'covenants.plano_empresario_valor',
    'covenants.plano_empresario_contratado',
    'covenants.plano_empresario_divida',
    'covenants.contratos_total',
    'covenants.contratos_ativos',
    'covenants.contratos_quitados',
    'covenants.contratos_distratados',
    'covenants.recebiveis_pre_pos_snapshot',
    'covenants.faixa_atraso_table',
    'covenants.recebimentos_periodo',
    'covenants.extrato_resumido',
    'covenants.transacoes_por_tipo_serie',
  ],
};
