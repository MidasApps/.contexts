/**
 * Página 13 do Looker Vila Rosa (Situação de Certidões) — fonte certidoes.
 *
 * "% válidas" usa KPI `format:'percent'` (não gauge): `certidoes_validas_pct`
 * é razão 0–1, e o pipeline de gauge não escala x100 (ver covenants-v2-
 * visao-executiva.template.mjs para a explicação completa do porquê).
 *
 * Status usa `format:'status-badge'` SEM `statusMap` explícito: os defaults
 * de `resolveStatusVariant` (src/pages/explore/ui/blocks/status-badge.ts)
 * já mapeiam 'Válida'→success e 'Inválida'→danger exatamente como o domínio
 * usa (MAPEAMENTO §6 pág.13: "Prefeitura-GO Inválida").
 */

function kpi(id, label, description, opts = {}) {
  return {
    id, type: 'kpi', label, value: '—', description, colSpan: opts.colSpan ?? 3,
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
    ...(opts.format ? { format: opts.format } : {}),
  };
}

function table(id, title, columns, colSpan, metricId) {
  return { id, type: 'table', title, columns, rows: [], colSpan, ...(metricId ? { metricId } : {}) };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const blockMap = {
  'kpi-certidoes-data-consulta': kpi('kpi-certidoes-data-consulta', 'Data Consulta', 'Data mais recente de consulta às certidões (snapshot atual)', { metricId: 'covenants.certidoes_data_consulta' }),
  'kpi-certidoes-validas-pct': kpi('kpi-certidoes-validas-pct', 'Percentual de Certidões Válidas', 'Certidões com status Válida sobre o total (snapshot atual)', { metricId: 'covenants.certidoes_validas_pct', format: 'percent' }),
  'table-certidoes': table('table-certidoes', 'Situação das Certidões', [
    { header: 'Certidão Órgão', accessorKey: 'certidao_orgao' },
    { header: 'Certidão', accessorKey: 'certidao' },
    { header: 'Tipo', accessorKey: 'tipo' },
    { header: 'Status', accessorKey: 'status', format: 'status-badge' },
  ], 6, 'covenants.certidoes_table'),
};

const layout = [
  row('row-kpis', ['kpi-certidoes-data-consulta', 'kpi-certidoes-validas-pct']),
  row('row-tabela', ['table-certidoes']),
];

export default {
  id: 'covenants-v2-certidoes',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Situação de Certidões',
  description: 'Compliance documental: data da última consulta e status por certidão',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'certidoes.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'certidoes.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.certidoes_data_consulta',
    'covenants.certidoes_validas_pct',
    'covenants.certidoes_table',
  ],
};
