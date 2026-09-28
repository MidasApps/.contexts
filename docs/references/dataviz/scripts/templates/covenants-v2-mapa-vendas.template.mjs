/**
 * Página 6 do Looker Vila Rosa (Mapa de Vendas) — tabela única full-width.
 * Fonte: `covenants.mapa_vendas_table` (join fluxo_caixa × contratos, filtro
 * ATIVO, Task 11). Colunas na mesma ordem do MAPEAMENTO §6.
 *
 * Rating Liquid usa `format:'status-badge'` (Fase 1) com statusMap A–H
 * ilustrativo (não há semáforo de rating no domínio — MAPEAMENTO §7 confirma
 * que o Looker original só usa paleta categórica, sem semântica de status).
 * Convenção adotada: A/B = success, C/D/E = warning, F/G/H = danger.
 */

function table(id, title, columns, colSpan, metricId, extra = {}) {
  return {
    id, type: 'table', title, columns, rows: [], colSpan,
    ...(metricId ? { metricId } : {}),
    ...(extra.footerAggregations ? { footerAggregations: extra.footerAggregations } : {}),
  };
}

function row(id, blockIds) {
  return { id, blockIds };
}

const RATING_STATUS_MAP = {
  A: 'success', B: 'success',
  C: 'warning', D: 'warning', E: 'warning',
  F: 'danger', G: 'danger', H: 'danger',
};

const blockMap = {
  'table-mapa-vendas': table('table-mapa-vendas', 'Mapa de Vendas', [
    { header: 'Data Base Report', accessorKey: 'data_base_report', format: 'date' },
    { header: 'Unidade', accessorKey: 'unidade' },
    { header: 'Status Contrato', accessorKey: 'status_contrato' },
    { header: 'Rating Liquid', accessorKey: 'rating_liquid', format: 'status-badge', statusMap: RATING_STATUS_MAP },
    { header: 'Score', accessorKey: 'score', format: 'number' },
    { header: 'Valor Imóvel', accessorKey: 'valor_imovel', format: 'currency' },
    { header: 'Categoria Venda', accessorKey: 'categoria_venda' },
    { header: 'Data Emissão', accessorKey: 'data_emissao', format: 'date' },
    { header: 'Valor Atraso', accessorKey: 'valor_atraso', format: 'currency' },
    { header: 'Restrições', accessorKey: 'restricoes', format: 'currency' },
    { header: 'Recebíveis Pré-Chaves', accessorKey: 'recebiveis_pre_chaves', format: 'currency' },
    { header: 'Recebíveis Pós-Chaves', accessorKey: 'recebiveis_pos_chaves', format: 'currency' },
  ], 6, 'covenants.mapa_vendas_table', {
    footerAggregations: { unidade: 'Total geral', recebiveis_pre_chaves: 'sum', recebiveis_pos_chaves: 'sum' },
  }),
};

const layout = [
  row('row-mapa-vendas', ['table-mapa-vendas']),
];

export default {
  id: 'covenants-v2-mapa-vendas',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Mapa de Vendas',
  description: 'Contratos ativos com rating, score e recebíveis pré/pós-chaves por unidade',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'contratos.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'contratos.data_base_report' },
    },
  },
  metricRefs: ['covenants.mapa_vendas_table'],
};
