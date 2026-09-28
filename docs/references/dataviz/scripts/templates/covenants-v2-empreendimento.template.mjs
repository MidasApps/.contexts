/**
 * Página 3 do Looker Vila Rosa (Empreendimento) — 100% KPI cards, 2 grades +
 * nota de rodapé. Todos os 16 ids `covenants.emp_*` do catálogo (Task 11).
 *
 * Notas de formatação:
 * - `emp_realizado_acum` é % 0–100 CRU (mesma família de `obra_*`, ver
 *   decisão #4 do controller) — `format:'number'` com `decimals: 2,
 *   suffix: '%'` (Task 13 fix pós-review), NÃO `format:'percent'` (que
 *   multiplicaria por 100 de novo).
 * - `emp_previsao_entrega` não tem format (é uma data; KpiBlock só formata
 *   currency/percent/number — data crua exibe como string ISO via
 *   `formatValue`'s branch default).
 * - `emp_area_total_m2`/`emp_valor_vendido` reconciliados na Task 15 (ver
 *   covenants-v2.mjs, FIX pós-review): a fonte real é `SUM(mapa_de_vendas.
 *   area_total)` (23.904,26, MATCH) e `SUM(contratos.valor_imovel)` sem
 *   filtro de status (100.191.767,55, MATCH) — não `ficha_cadastral.
 *   projeto_total_m2` nem `valor_contrato` de ATIVO/QUITADO como o
 *   MAPEAMENTO original sugeria. Descrições dos KPIs abaixo refletem a
 *   métrica real (fix final pré-merge).
 */

function kpi(id, label, description, opts = {}) {
  return {
    id, type: 'kpi', label, value: '—', description, colSpan: opts.colSpan ?? 2,
    ...(opts.metricId ? { metricId: opts.metricId } : {}),
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.positiveIsGood != null ? { positiveIsGood: opts.positiveIsGood } : {}),
    ...(opts.decimals != null ? { decimals: opts.decimals } : {}),
    ...(opts.suffix ? { suffix: opts.suffix } : {}),
  };
}

function text(id, content, colSpan = 2) {
  return { id, type: 'text', content, colSpan };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const blockMap = {
  // ─── Grade "Informações Gerais" ──────────────────────────────────
  'kpi-emp-total-unidades': kpi('kpi-emp-total-unidades', 'Projeto Total Unidades', 'Total de unidades do empreendimento', { metricId: 'covenants.emp_total_unidades', format: 'number' }),
  'kpi-emp-area-total-m2': kpi('kpi-emp-area-total-m2', 'Área Total (m²)', 'Soma da área total das unidades (mapa de vendas, snapshot atual)', { metricId: 'covenants.emp_area_total_m2', format: 'number', decimals: 2 }),
  'kpi-emp-vgv': kpi('kpi-emp-vgv', 'Projeto VGV', 'Valor Geral de Vendas total', { metricId: 'covenants.emp_vgv', format: 'currency' }),
  'kpi-emp-permutas-qtde': kpi('kpi-emp-permutas-qtde', 'Qtde Permutas', 'Unidades de permuta (exclui G1/G2/Térreo)', { metricId: 'covenants.emp_permutas_qtde', format: 'number' }),
  'kpi-emp-permutas-m2': kpi('kpi-emp-permutas-m2', 'Permuta (m²)', 'Área total das unidades de permuta', { metricId: 'covenants.emp_permutas_m2', format: 'number', decimals: 2 }),
  'kpi-emp-permutas-vgv': kpi('kpi-emp-permutas-vgv', 'Permuta (VGV)', 'Valor de avaliação das unidades de permuta', { metricId: 'covenants.emp_permutas_vgv', format: 'currency' }),
  'kpi-emp-garantias-un': kpi('kpi-emp-garantias-un', 'Unidades em Garantia', 'Unidades em garantia (exclui G1/G2/Térreo)', { metricId: 'covenants.emp_garantias_un', format: 'number' }),
  'kpi-emp-garantias-m2': kpi('kpi-emp-garantias-m2', 'Garantias (m²)', 'Área total das unidades em garantia', { metricId: 'covenants.emp_garantias_m2', format: 'number', decimals: 2 }),
  'kpi-emp-garantias-vgv': kpi('kpi-emp-garantias-vgv', 'Garantias (VGV)', 'Valor de avaliação das unidades em garantia', { metricId: 'covenants.emp_garantias_vgv', format: 'currency' }),

  // ─── Grade "Visão Geral de Vendas" ────────────────────────────────
  'kpi-emp-unidades-vendidas': kpi('kpi-emp-unidades-vendidas', 'Unidades Vendidas', 'Contratos ATIVO ou QUITADO', { metricId: 'covenants.emp_unidades_vendidas', format: 'number' }),
  'kpi-emp-valor-vendido': kpi('kpi-emp-valor-vendido', 'Total Valor Vendido', 'Valor de venda (valor do imóvel) de todos os contratos comercializados, qualquer status', { metricId: 'covenants.emp_valor_vendido', format: 'currency' }),
  'kpi-emp-saldo-devedor': kpi('kpi-emp-saldo-devedor', 'Saldo Devedor', 'Também considera os valores em atraso', { metricId: 'covenants.emp_saldo_devedor', format: 'currency', positiveIsGood: false }),
  'kpi-emp-estoque': kpi('kpi-emp-estoque', 'Estoque (un)', 'Unidades em estoque', { metricId: 'covenants.emp_estoque', format: 'number' }),
  'kpi-emp-estoque-m2': kpi('kpi-emp-estoque-m2', 'Estoque (m²)', 'Área em estoque', { metricId: 'covenants.emp_estoque_m2', format: 'number', decimals: 2 }),
  'kpi-emp-previsao-entrega': kpi('kpi-emp-previsao-entrega', 'Previsão de Entrega', 'Data prevista da obra (ficha cadastral)', { metricId: 'covenants.emp_previsao_entrega' }),
  'kpi-emp-realizado-acum': kpi('kpi-emp-realizado-acum', 'Realizado Acumulado (%)', 'Evolução física da obra na medição atual — percentual 0-100 cru', { metricId: 'covenants.emp_realizado_acum', format: 'number', decimals: 2, suffix: '%' }),

  'text-nota-saldo': text('text-nota-saldo', '_O Saldo Devedor apresentado também leva em consideração os valores em atraso._', 4),
};

const layout = [
  row('row-gerais-1', ['kpi-emp-total-unidades', 'kpi-emp-area-total-m2', 'kpi-emp-vgv']),
  row('row-gerais-2', ['kpi-emp-permutas-qtde', 'kpi-emp-permutas-m2', 'kpi-emp-permutas-vgv']),
  row('row-gerais-3', ['kpi-emp-garantias-un', 'kpi-emp-garantias-m2', 'kpi-emp-garantias-vgv']),
  row('row-vendas-1', ['kpi-emp-unidades-vendidas', 'kpi-emp-valor-vendido', 'kpi-emp-saldo-devedor']),
  row('row-vendas-2', ['kpi-emp-estoque', 'kpi-emp-estoque-m2', 'kpi-emp-previsao-entrega']),
  row('row-vendas-3', ['kpi-emp-realizado-acum', 'text-nota-saldo']),
];

export default {
  id: 'covenants-v2-empreendimento',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Empreendimento',
  description: 'KPIs cadastrais e de vendas do empreendimento (unidades, área, VGV, permutas, garantias, estoque)',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'covenants_calculo.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'covenants_calculo.data_base_report' },
    },
  },
  metricRefs: [
    'covenants.emp_total_unidades',
    'covenants.emp_area_total_m2',
    'covenants.emp_vgv',
    'covenants.emp_permutas_qtde',
    'covenants.emp_permutas_m2',
    'covenants.emp_permutas_vgv',
    'covenants.emp_garantias_un',
    'covenants.emp_garantias_m2',
    'covenants.emp_garantias_vgv',
    'covenants.emp_unidades_vendidas',
    'covenants.emp_valor_vendido',
    'covenants.emp_saldo_devedor',
    'covenants.emp_estoque',
    'covenants.emp_estoque_m2',
    'covenants.emp_previsao_entrega',
    'covenants.emp_realizado_acum',
  ],
};
