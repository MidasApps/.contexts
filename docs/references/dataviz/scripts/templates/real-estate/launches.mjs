/** Grupo B — Lançamentos: 3 páginas. */
import { page, kpi, gauge, donut, chart, heatmap, table, boxplot, funnel, sankey, col } from './_blocks.mjs';

const DEVELOPMENTS = ['reserva_jardins', 'vista_parque', 'horizonte_sul', 'alto_do_ipe', 'praca_das_flores', 'origem_campinas'];

export const templates = [
  page({
    id: 'imobiliaria-lancamentos-painel', name: 'Painel de Lançamentos',
    description: 'VGV, VSO, estoque e reservas dos empreendimentos em comercialização.',
    rows: [
      [kpi('lanc_vgv_mes', 'VGV de lançamentos', { format: 'currency', spark: 'lanc_vgv_serie' }), kpi('lanc_unidades_vendidas_mes', 'Unidades vendidas', { format: 'number' }), kpi('lanc_vso_mes', 'VSO do mês', { format: 'percent', decimals: 1 })],
      [kpi('lanc_vso_acumulada', 'VSO acumulada', { format: 'percent', decimals: 1 }), kpi('lanc_ticket_medio', 'Ticket médio', { format: 'currency' }), kpi('lanc_estoque_disponivel_vgv', 'VGV em estoque', { format: 'currency' })],
      [kpi('lanc_reservas_abertas', 'Reservas em aberto', { format: 'number' }), kpi('lanc_distrato_pct', 'Distratos (12 m)', { format: 'percent', decimals: 1, positiveIsGood: false }), gauge('lanc_desconto_medio_pct', 'Desconto médio', { threshold: 5, warnThreshold: 3, reverseScale: true, format: 'percent', decimals: 1 })],
      [chart('lanc_vso_serie_por_empreendimento', 'VSO mensal por empreendimento', 'line', DEVELOPMENTS, { format: 'percent' }), chart('lanc_vendas_por_empreendimento_serie', 'Unidades vendidas por empreendimento', 'stacked-bar', DEVELOPMENTS, { format: 'number' })],
      [table('lanc_empreendimentos_status', 'Empreendimentos', [col('empreendimento', 'Empreendimento'), col('fase', 'Fase', 'status-badge'), col('total', 'Unidades', 'number'), col('vendidas', 'Vendidas', 'number'), col('reservadas', 'Reservadas', 'number'), col('disponiveis', 'Disponíveis', 'number'), col('vso_acum_pct', 'VSO acum.', 'percent'), col('vgv_vendido', 'VGV vendido', 'currency'), col('vgv_estoque', 'VGV estoque', 'currency'), col('previsao_entrega', 'Entrega', 'date')])],
      [donut('lanc_mix_forma_pagamento', 'Forma de pagamento', { format: 'number', colSpan: 3 }), chart('lanc_vendas_por_tipologia', 'Vendas por tipologia', 'bar', ['value'], { xAxisKey: 'tipologia', format: 'number' })],
    ],
  }),
  page({
    id: 'imobiliaria-espelho-vendas', name: 'Espelho de Vendas',
    description: 'Mapa das unidades por torre, andar e tipologia, com curva de vendas e preço por m².',
    rows: [
      [kpi('espelho_pct_vendido', 'Vendido', { format: 'percent', decimals: 1, colSpan: 3 }), kpi('espelho_vgv_restante', 'VGV restante', { format: 'currency', colSpan: 3 })],
      [heatmap('espelho_torre_andar', 'Espelho: torre/andar × tipologia (% vendido)', { rowLabel: 'Torre · andar', colLabel: 'Tipologia', format: 'percent' })],
      [chart('espelho_curva_vendas_acumulada', 'Curva de vendas acumulada', 'area', ['value'], { format: 'number' }), chart('espelho_disponiveis_por_tipologia', 'Disponíveis por tipologia', 'bar', ['value'], { xAxisKey: 'tipologia', format: 'number' })],
      [boxplot('espelho_preco_m2_por_tipologia', 'Preço por m² por tipologia', { format: 'currency', colSpan: 6 })],
      [table('espelho_unidades', 'Unidades do espelho', [col('empreendimento', 'Empreendimento'), col('unidade', 'Unidade'), col('tipologia', 'Tipologia'), col('area_m2', 'Área m²', 'number'), col('valor_tabela', 'Tabela', 'currency'), col('status', 'Status', 'status-badge'), col('corretor', 'Corretor'), col('data_venda', 'Venda', 'date')])],
    ],
  }),
  page({
    id: 'imobiliaria-funil-lancamento', name: 'Funil de Lançamento',
    description: 'Do lead ao contrato nos lançamentos: conversão, custo por venda, origem, migração de estágios e motivos de perda.',
    rows: [
      [funnel('lanc_funil', 'Funil de lançamentos', { colSpan: 3 }), kpi('lanc_conversao_lead_venda_pct', 'Conversão lead → venda', { format: 'percent', decimals: 2, colSpan: 3 })],
      [kpi('lanc_custo_por_venda', 'Custo de marketing por venda', { format: 'currency', colSpan: 3 }), chart('lanc_leads_por_origem', 'Leads por origem', 'bar', ['value'], { xAxisKey: 'origem', format: 'number' })],
      [sankey('lanc_migracao_estagios', 'Migração de estágios', { colSpan: 3 }), chart('lanc_motivos_perda', 'Motivos de perda', 'pareto', ['value'], { xAxisKey: 'motivo', format: 'number' })],
      [table('lanc_ranking_corretores', 'Ranking de corretores (lançamentos)', [col('corretor', 'Corretor'), col('unidade', 'Unidade'), col('leads', 'Leads', 'number'), col('visitas', 'Visitas', 'number'), col('propostas', 'Propostas', 'number'), col('vendas', 'Vendas', 'number'), col('vgv', 'VGV', 'currency'), col('conversao_pct', 'Conversão', 'percent')])],
    ],
  }),
];
