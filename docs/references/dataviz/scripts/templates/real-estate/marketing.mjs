/** Grupo E — Marketing: 3 páginas. */
import { page, kpi, progress, donut, chart, scatter, heatmap, table, col } from './_blocks.mjs';

export const templates = [
  page({
    id: 'imobiliaria-marketing-painel', name: 'Painel de Marketing',
    description: 'Leads, qualificação, investimento, CPL, CAC e ROI, com origem, interesse e horário de entrada.',
    rows: [
      [kpi('mkt_leads_mes', 'Leads no mês', { format: 'number', spark: 'mkt_leads_serie' }), kpi('mkt_leads_qualificados_mes', 'Leads qualificados', { format: 'number' }), kpi('mkt_taxa_qualificacao_pct', 'Taxa de qualificação', { format: 'percent', decimals: 1 })],
      [kpi('mkt_investimento_mes', 'Investimento em mídia', { format: 'currency' }), kpi('mkt_cpl', 'CPL', { format: 'currency', positiveIsGood: false }), kpi('mkt_cpl_qualificado', 'CPL qualificado', { format: 'currency', positiveIsGood: false })],
      [kpi('mkt_cac', 'CAC', { format: 'currency', positiveIsGood: false }), kpi('mkt_roi_pct', 'ROI de mídia (12 m)', { format: 'percent', decimals: 0 }), progress('mkt_atingimento_meta_leads_pct', 'Meta de leads')],
      [chart('mkt_leads_vs_investimento_serie', 'Leads × investimento', 'composed', ['leads', 'investimento'], { format: 'number' }), chart('mkt_leads_por_origem_serie', 'Leads por origem', 'stacked-bar', ['portais', 'midia_paga', 'site', 'social', 'indicacao', 'outros'], { format: 'number' })],
      [donut('mkt_leads_por_origem', 'Composição por origem', { format: 'number', colSpan: 3 }), donut('mkt_leads_por_interesse', 'Leads por interesse', { format: 'number', colSpan: 3 })],
      [heatmap('mkt_leads_dia_x_hora', 'Leads por dia da semana e hora', { rowLabel: 'Dia', colLabel: 'Hora', format: 'number' })],
    ],
  }),
  page({
    id: 'imobiliaria-origem-leads-cac', name: 'Origem de Leads & CAC',
    description: 'Performance por canal: investimento, leads, conversão, CPL, CAC e receita atribuída.',
    rows: [
      [table('mkt_canais_performance', 'Performance por canal (12 m)', [col('canal', 'Canal'), col('investimento', 'Investimento', 'currency'), col('leads', 'Leads', 'number'), col('qualificados', 'Qualificados', 'number'), col('visitas', 'Visitas', 'number'), col('fechamentos', 'Fechamentos', 'number'), col('cpl', 'CPL', 'currency'), col('cac', 'CAC', 'currency'), col('conversao_pct', 'Conversão', 'percent'), col('receita_atribuida', 'Receita atribuída', 'currency')])],
      [chart('mkt_cpl_por_canal', 'CPL por canal', 'bar', ['value'], { xAxisKey: 'canal', format: 'currency' }), chart('mkt_conversao_por_canal', 'Conversão por canal', 'bar', ['value'], { xAxisKey: 'canal', format: 'percent' })],
      [scatter('mkt_investimento_x_leads_canal', 'Investimento × leads por canal', { xLabel: 'Investimento', yLabel: 'Leads', xFormat: 'currency', yFormat: 'number' }), chart('mkt_leads_pareto_origem', 'Pareto de origens', 'pareto', ['value'], { xAxisKey: 'bucket', format: 'number' })],
      [chart('mkt_receita_atribuida_por_canal', 'Receita atribuída por canal', 'bar', ['value'], { xAxisKey: 'canal', format: 'currency', colSpan: 6 })],
    ],
  }),
  page({
    id: 'imobiliaria-campanhas', name: 'Campanhas',
    description: 'Campanhas ativas, CTR, leads por dia e desempenho por campanha.',
    rows: [
      [kpi('mkt_campanhas_ativas', 'Campanhas ativas', { format: 'number', colSpan: 3 }), kpi('mkt_ctr_medio_pct', 'CTR médio', { format: 'percent', decimals: 2, colSpan: 3 })],
      [chart('mkt_campanha_leads_diario', 'Leads por dia: lançamentos × always-on', 'line', ['lancamentos', 'always_on'], { format: 'number', colSpan: 6 })],
      [table('mkt_campanhas', 'Campanhas', [col('campanha', 'Campanha'), col('canal', 'Canal'), col('unidade', 'Unidade'), col('investimento', 'Investimento', 'currency'), col('impressoes', 'Impressões', 'number'), col('cliques', 'Cliques', 'number'), col('ctr_pct', 'CTR', 'percent'), col('leads', 'Leads', 'number'), col('cpl', 'CPL', 'currency'), col('qualificados', 'Qualificados', 'number')])],
    ],
  }),
];
