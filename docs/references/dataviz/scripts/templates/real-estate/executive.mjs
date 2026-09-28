/** Grupo A — Visão Executiva: 3 páginas. */
import { page, kpi, gauge, progress, comparison, targets, sparkrows, donut, treemap, chart, scatter, heatmap, table, boxplot, col } from './_blocks.mjs';

export const templates = [
  page({
    id: 'imobiliaria-painel-executivo', name: 'Painel Executivo',
    description: 'VGV, receita, margem, carteira de locação e metas do mês, com tendências e alertas por unidade.',
    rows: [
      [kpi('vgv_mes', 'VGV do mês', { format: 'currency', spark: 'vgv_serie' }), kpi('receita_bruta_mes', 'Receita bruta', { format: 'currency' }), kpi('margem_operacional_pct', 'Margem operacional', { format: 'percent' })],
      [kpi('vendas_qtd_mes', 'Vendas', { format: 'number' }), kpi('locacoes_fechadas_mes', 'Locações fechadas', { format: 'number' }), kpi('carteira_locacao_ativa', 'Contratos de locação ativos', { format: 'number' })],
      [progress('atingimento_meta_vgv_pct', 'Meta de VGV', { targetLabel: 'meta do mês' }), progress('atingimento_meta_receita_pct', 'Meta de receita'), kpi('receita_taxa_adm_mes', 'Receita recorrente (taxa adm.)', { format: 'currency' })],
      [sparkrows('executivo_tendencias', 'Tendências do negócio', { colSpan: 6 })],
      [chart('vgv_por_departamento_serie', 'VGV por departamento', 'stacked-bar', ['prontos', 'lancamentos'], { format: 'currency' }), chart('receita_por_departamento_serie', 'Receita por departamento', 'line', ['lancamentos', 'prontos', 'locacao', 'servicos'], { format: 'currency' })],
      [donut('receita_por_fonte', 'Receita por fonte', { format: 'currency', showLegendCards: true }), comparison('vgv_vs_ano_anterior', 'VGV vs. mesmo mês do ano anterior', { currentLabel: 'Este ano', previousLabel: 'Ano anterior' }), gauge('inadimplencia_locacao_pct', 'Inadimplência de locação', { threshold: 5, warnThreshold: 3, reverseScale: true, format: 'percent', decimals: 1 })],
      [gauge('vacancia_carteira_pct', 'Vacância da carteira', { threshold: 12, warnThreshold: 8, reverseScale: true, format: 'percent', decimals: 1 }), table('alertas_executivos', 'Alertas', [col('unidade', 'Unidade'), col('alerta', 'Alerta'), col('valor', 'Valor', 'number')], { colSpan: 4 })],
    ],
  }),
  page({
    id: 'imobiliaria-comparativo-unidades', name: 'Comparativo de Unidades',
    description: 'Ranking das unidades por VGV, receita, margem e atingimento, com metas e dispersão de ticket.',
    rows: [
      [table('ranking_unidades', 'Ranking de unidades', [col('unidade', 'Unidade'), col('vgv', 'VGV', 'currency'), col('vendas', 'Vendas', 'number'), col('locacoes', 'Locações', 'number'), col('captacoes', 'Captações', 'number'), col('leads', 'Leads', 'number'), col('conversao_pct', 'Conversão', 'percent'), col('receita', 'Receita', 'currency'), col('margem_pct', 'Margem', 'percent'), col('atingimento_pct', 'Meta', 'percent')], { footerAggregations: { unidade: 'Total', vgv: 'sum', vendas: 'sum', locacoes: 'sum', captacoes: 'sum', leads: 'sum', receita: 'sum' } })],
      [chart('vgv_por_unidade', 'VGV por unidade', 'bar', ['value'], { xAxisKey: 'unidade', colSpan: 2, format: 'currency' }), chart('receita_por_unidade', 'Receita por unidade', 'bar', ['value'], { xAxisKey: 'unidade', colSpan: 2, format: 'currency' }), chart('margem_por_unidade', 'Margem por unidade', 'bar', ['value'], { xAxisKey: 'unidade', colSpan: 2, format: 'percent' })],
      [targets('metas_por_unidade', 'Meta de VGV por unidade', { colSpan: 3 }), treemap('carteira_locacao_por_unidade', 'Carteira de locação por unidade', { format: 'number' })],
      [heatmap('vgv_unidade_x_mes', 'VGV por unidade e mês', { rowLabel: 'Unidade', colLabel: 'Mês', format: 'currency' })],
      [scatter('unidades_leads_x_conversao', 'Leads × conversão por unidade', { xLabel: 'Leads (12 m)', yLabel: 'Conversão', yFormat: 'percent', xFormat: 'number' }), boxplot('ticket_por_unidade_dist', 'Ticket de venda por unidade', { format: 'currency' })],
    ],
  }),
  page({
    id: 'imobiliaria-metas-resultados', name: 'Metas & Resultados',
    description: 'Realizado versus meta em VGV, vendas, locações, captações, leads e receita, com ponte por unidade e forecast.',
    rows: [
      [targets('metas_consolidadas', 'Metas do mês', { colSpan: 4, display: 'list', format: 'number' }), kpi('forecast_vgv_mes', 'Forecast de VGV do mês', { format: 'currency', description: 'Run-rate projetado para o mês inteiro' })],
      [chart('vgv_realizado_vs_meta_serie', 'VGV realizado vs. meta', 'composed', ['realizado', 'meta'], { format: 'currency' }), chart('receita_realizada_vs_meta_serie', 'Receita realizada vs. meta', 'composed', ['realizado', 'meta'], { format: 'currency' })],
      [table('atingimento_por_departamento', 'Atingimento por departamento', [col('departamento', 'Departamento'), col('meta', 'Meta', 'currency'), col('realizado', 'Realizado', 'currency'), col('atingimento_pct', 'Atingimento', 'percent'), col('gap', 'Gap', 'currency')], { colSpan: 3 }), chart('ponte_meta_vgv', 'Ponte meta → realizado', 'waterfall', ['value'], { xAxisKey: 'bucket', format: 'currency' })],
    ],
  }),
];
