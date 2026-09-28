/** Grupo F — Financeiro: 3 páginas. */
import { page, kpi, comparison, donut, chart, table, col } from './_blocks.mjs';

export const templates = [
  page({
    id: 'imobiliaria-dre-gerencial', name: 'DRE Gerencial',
    description: 'Receita, despesa, resultado e margem por categoria, unidade e departamento.',
    rows: [
      [kpi('fin_receita_bruta_mes', 'Receita bruta', { format: 'currency', spark: 'fin_receita_serie' }), kpi('fin_despesas_mes', 'Despesas', { format: 'currency', positiveIsGood: false }), kpi('fin_resultado_mes', 'Resultado', { format: 'currency' })],
      [kpi('fin_margem_pct', 'Margem', { format: 'percent', decimals: 1 }), kpi('fin_receita_recorrente_pct', 'Receita recorrente', { format: 'percent', decimals: 1, description: 'Taxa de administração sobre a receita' }), kpi('fin_despesa_pessoal_pct', 'Pessoal e comissões / receita', { format: 'percent', decimals: 1, positiveIsGood: false })],
      [chart('fin_dre_cascata', 'DRE em cascata', 'waterfall', ['value'], { xAxisKey: 'bucket', format: 'currency', colSpan: 4 }), comparison('fin_resultado_vs_mes_anterior', 'Resultado vs. mês anterior')],
      [chart('fin_receita_por_categoria_serie', 'Receita por categoria', 'stacked-bar', ['comissao_pronto', 'comissao_lancamento', 'taxa_administracao', 'intermediacao_locacao', 'servicos'], { format: 'currency' }), chart('fin_despesa_por_categoria_serie', 'Despesa por categoria', 'stacked-bar', ['pessoal', 'comissao_corretor', 'marketing', 'ocupacao', 'tecnologia', 'administrativo', 'impostos'], { format: 'currency' })],
      [chart('fin_resultado_serie', 'Receita, despesa e resultado', 'line', ['receita', 'despesa', 'resultado'], { format: 'currency', colSpan: 6 })],
      [table('fin_dre_por_unidade', 'DRE por unidade', [col('unidade', 'Unidade'), col('receita', 'Receita', 'currency'), col('despesa', 'Despesa', 'currency'), col('resultado', 'Resultado', 'currency'), col('margem_pct', 'Margem', 'percent'), col('receita_por_corretor', 'Receita / corretor', 'currency')], { colSpan: 3 }), table('fin_dre_por_departamento', 'DRE por departamento', [col('departamento', 'Departamento'), col('receita', 'Receita', 'currency'), col('despesa', 'Despesa', 'currency'), col('resultado', 'Resultado', 'currency'), col('margem_pct', 'Margem', 'percent')], { colSpan: 3 })],
    ],
  }),
  page({
    id: 'imobiliaria-comissoes', name: 'Comissões',
    description: 'Comissões a receber e a pagar, prazo de recebimento, split, aging e perdas por distrato.',
    rows: [
      [kpi('com_a_receber_total', 'A receber', { format: 'currency' }), kpi('com_recebida_mes', 'Recebidas no mês', { format: 'currency' }), kpi('com_prazo_medio_recebimento_dias', 'Prazo médio de recebimento', { format: 'number', suffix: ' dias', positiveIsGood: false })],
      [kpi('com_a_pagar_corretores', 'A pagar a corretores', { format: 'currency' }), kpi('com_split_medio_corretor_pct', 'Split médio do corretor', { format: 'percent', decimals: 1 }), kpi('com_perda_por_distrato_mes', 'Perdida por distrato', { format: 'currency', positiveIsGood: false })],
      [chart('com_aging_a_receber', 'Aging de comissões a receber', 'bar', ['value'], { xAxisKey: 'faixa', format: 'currency' }), donut('com_a_receber_por_incorporadora', 'A receber por incorporadora', { format: 'currency', colSpan: 3 })],
      [table('com_pendentes', 'Comissões pendentes', [col('venda', 'Venda'), col('referencia', 'Referência'), col('corretor', 'Corretor'), col('valor', 'Valor', 'currency'), col('dias', 'Dias', 'number'), col('departamento', 'Depto')])],
      [table('com_por_corretor_mes', 'Comissões por corretor', [col('corretor', 'Corretor'), col('unidade', 'Unidade'), col('vendas', 'Vendas', 'number'), col('comissao_gerada', 'Gerada', 'currency'), col('a_receber', 'A receber', 'currency'), col('paga', 'Paga', 'currency')])],
    ],
  }),
  page({
    id: 'imobiliaria-fluxo-caixa', name: 'Fluxo de Caixa & Recebíveis',
    description: 'Entradas, saídas, saldo, projeção de 90 dias e contas a pagar vencidas.',
    rows: [
      [kpi('cx_entradas_mes', 'Entradas', { format: 'currency' }), kpi('cx_saidas_mes', 'Saídas', { format: 'currency', positiveIsGood: false }), kpi('cx_saldo_mes', 'Saldo do mês', { format: 'currency' })],
      [kpi('cx_previsto_proximos_90', 'Previsto para 90 dias', { format: 'currency', colSpan: 2 }), chart('cx_realizado_vs_previsto_serie', 'Saldo realizado × projetado', 'composed', ['realizado', 'projetado'], { format: 'currency', colSpan: 4 })],
      [chart('cx_entradas_por_fonte_serie', 'Entradas por fonte', 'stacked-bar', ['vendas', 'locacao', 'servicos'], { format: 'currency', colSpan: 6 })],
      [table('cx_contas_a_pagar_vencidas', 'Contas a pagar vencidas', [col('lancamento', 'Lançamento'), col('unidade', 'Unidade'), col('categoria', 'Categoria'), col('data_vencimento', 'Vencimento', 'date'), col('valor', 'Valor', 'currency'), col('dias', 'Dias', 'number')])],
    ],
  }),
];
