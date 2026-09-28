/**
 * Página 14 do Looker Vila Rosa (Extrato Detalhado) — anexo/drill-through de
 * Entradas & Saídas (pág.12). Dropdowns Banco/Categoria/Tipo, tabela full com
 * até 10.000 linhas (limit já embutido na recipe `covenants.extrato_table`),
 * ordenada por data desc, linha de total.
 *
 * `templateId` desta página (`covenants-v2-extrato-detalhado`) é o alvo do
 * token `{report:covenants-v2-extrato-detalhado}` usado no bloco `text` de
 * drill-through de `covenants-v2-entradas-saidas.template.mjs`.
 *
 * FIX (Task 13 pós-review, autorizado pelo controller): dropdowns
 * Banco/Categoria/Tipo agora são funcionais de ponta a ponta —
 * `covenants.extrato_table` ganhou tokens `{filter.banco:transacoes.
 * banco_codigo}`/`{filter.categoria:transacoes.categoria}`/`{filter.tipo:
 * transacoes.tipo}` no SQL (scripts/metrics/covenants-v2.mjs), além do
 * `{filter.date_range:transacoes.data}` já existente.
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

const blockMap = {
  'table-extrato': table('table-extrato', 'Extrato Detalhado', [
    { header: 'Data', accessorKey: 'data', format: 'date' },
    { header: 'Banco', accessorKey: 'banco' },
    { header: 'Descrição', accessorKey: 'descricao' },
    { header: 'Categoria', accessorKey: 'categoria' },
    { header: 'Tipo', accessorKey: 'tipo' },
    { header: 'Pagador Tipo', accessorKey: 'pagador_tipo' },
    { header: 'Pagador', accessorKey: 'pagador' },
    { header: 'Recebedor Tipo', accessorKey: 'recebedor_tipo' },
    { header: 'Recebedor', accessorKey: 'recebedor' },
    { header: 'Valor', accessorKey: 'valor', format: 'currency' },
  ], 6, 'covenants.extrato_table', {
    footerAggregations: { data: 'Total geral', valor: 'sum' },
  }),
};

const layout = [
  row('row-extrato', ['table-extrato']),
];

export default {
  id: 'covenants-v2-extrato-detalhado',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Extrato Detalhado',
  description: 'Lançamentos bancários detalhados (anexo de Entradas & Saídas), até 10.000 linhas',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'transacoes.data' },
      date_range: { kind: 'date_range', attribute: 'transacoes.data' },
      /*
       * Sem seletor por padrão (ADR-0025).
       *
       * Havia aqui `banco`, `categoria` e `tipo` com `control: 'dropdown'`.
       * Página não nasce com filtro: quem pede é o usuário, e quem cria é o
       * assistente (`add_page_filter`). As métricas seguem citando
       * `{filter.banco:…}` no template — placeholder sem filtro declarado vira
       * `1=1`, então o filtro volta a valer no instante em que for pedido, com
       * a mesma chave.
       */
    },
  },
  metricRefs: ['covenants.extrato_table'],
};
