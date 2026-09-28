/**
 * Página 12 do Looker Vila Rosa (Entradas & Saídas) — fonte transacoes +
 * blend categorias. Dropdowns Banco/Categoria via `metricPageFilters` (G3).
 * Drill-through para "Extrato Detalhado" (G5) via bloco `text` com tokens
 * `{groupId}`/`{report:<templateId>}`/`{pageFilters}` (resolvidos em
 * ReportPage — ver src/pages/report/ui/drill-through.ts).
 *
 * Título do gráfico de saídas CORRIGIDO (MAPEAMENTO §8: no Looker original o
 * gráfico de saídas está rotulado "Entradas" por engano — bug documentado,
 * não replicado).
 *
 * FIX (Task 13 pós-review, autorizado pelo controller): os dropdowns Banco
 * (`transacoes.banco_codigo`) e Categoria (`transacoes.categoria`) agora são
 * FUNCIONAIS de ponta a ponta — `transacoes_por_tipo_serie`, `entradas_por_
 * categoria` e `saidas_por_categoria` ganharam tokens `{filter.banco:
 * transacoes.banco_codigo}`/`{filter.categoria:transacoes.categoria}` no SQL
 * (scripts/metrics/covenants-v2.mjs). Confirmado em `resolveSqlRecipe`
 * (resolve-metric.ts:413-418) que pageFilter ausente ou `kind:'in'` com
 * `values:[]` (nenhuma seleção) sempre expande p/ `1=1` — nunca quebra o SQL
 * de quem não usa o dropdown. Validado com 1 caso filtrado real contra
 * BigQuery (task-13-report.md). `transacoes_por_tipo_serie` NÃO ganhou
 * filtro de `tipo` (é a própria dimensão da série ±).
 */

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
  'chart-transacoes-mensal': chart('chart-transacoes-mensal', 'Entradas & Saídas por Mês', 'bar', ['credit', 'debit'], 'bucket', 6, 'covenants.transacoes_por_tipo_serie'),
  'chart-entradas-categoria': chart('chart-entradas-categoria', 'Entradas por Categoria', 'bar', ['value'], 'categoria', 3, 'covenants.entradas_por_categoria'),
  'chart-saidas-categoria': chart('chart-saidas-categoria', 'Saídas por Categoria', 'bar', ['value'], 'categoria', 3, 'covenants.saidas_por_categoria'),
  'text-drill-extrato': text('text-drill-extrato', '[Ver Extrato Detalhado →](/g/{groupId}/r/{report:covenants-v2-extrato-detalhado}?{pageFilters})', 6),
};

const layout = [
  row('row-mensal', ['chart-transacoes-mensal']),
  row('row-categoria', ['chart-entradas-categoria', 'chart-saidas-categoria']),
  row('row-drill', ['text-drill-extrato']),
];

export default {
  id: 'covenants-v2-entradas-saidas',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Entradas & Saídas',
  description: 'Extrato bancário agregado por mês e por categoria (créditos e débitos)',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'transacoes.data' },
      date_range: { kind: 'date_range', attribute: 'transacoes.data' },
      /*
       * Sem seletor por padrão (ADR-0025).
       *
       * Havia aqui `banco` e `categoria` com `control: 'dropdown'`.
       * Página não nasce com filtro: quem pede é o usuário, e quem cria é o
       * assistente (`add_page_filter`). As métricas seguem citando
       * `{filter.banco:…}` no template — placeholder sem filtro declarado vira
       * `1=1`, então o filtro volta a valer no instante em que for pedido, com
       * a mesma chave.
       */
    },
  },
  metricRefs: [
    'covenants.transacoes_por_tipo_serie',
    'covenants.entradas_por_categoria',
    'covenants.saidas_por_categoria',
  ],
};
