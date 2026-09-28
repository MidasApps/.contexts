/** Grupo C — Prontos / Revenda: 3 páginas. */
import { page, kpi, gauge, progress, comparison, donut, treemap, chart, scatter, heatmap, table, boxplot, funnel, sankey, col } from './_blocks.mjs';

const BRANCHES = ['centro', 'zona_sul', 'zona_norte', 'abc', 'campinas', 'litoral'];

export const templates = [
  page({
    id: 'imobiliaria-prontos-painel', name: 'Painel de Vendas',
    description: 'VGV, ticket, comissão e ciclo de venda dos imóveis prontos, com composição por tipo, região, pagamento e banco.',
    rows: [
      [kpi('prontos_vgv_mes', 'VGV de prontos', { format: 'currency', spark: 'prontos_vgv_mensal' }), kpi('prontos_vendas_qtd_mes', 'Vendas', { format: 'number' }), kpi('prontos_ticket_medio', 'Ticket médio', { format: 'currency' })],
      [kpi('prontos_comissao_media_pct', 'Comissão média', { format: 'percent', decimals: 2 }), kpi('prontos_receita_comissao_mes', 'Receita de comissão', { format: 'currency' }), kpi('prontos_ciclo_venda_dias', 'Ciclo de venda', { format: 'number', suffix: ' dias' })],
      [gauge('prontos_desconto_medio_pct', 'Desconto médio', { threshold: 8, warnThreshold: 5, reverseScale: true, format: 'percent', decimals: 1 }), progress('prontos_atingimento_meta_pct', 'Meta de VGV (prontos)'), comparison('prontos_vgv_vs_mes_anterior', 'VGV vs. mês anterior')],
      [chart('prontos_vgv_serie', 'VGV e vendas por mês', 'composed', ['vgv', 'vendas'], { format: 'currency' }), chart('prontos_vendas_por_unidade_serie', 'Vendas por unidade', 'stacked-bar', BRANCHES, { format: 'number' })],
      [donut('prontos_vendas_por_tipo', 'Vendas por tipo de imóvel', { format: 'number' }), chart('prontos_vendas_por_regiao', 'Vendas por região', 'bar', ['value'], { xAxisKey: 'regiao', colSpan: 2, format: 'number' }), donut('prontos_forma_pagamento', 'Forma de pagamento', { format: 'number' })],
      [chart('prontos_vendas_por_banco', 'Financiamentos por banco', 'bar', ['value'], { xAxisKey: 'banco', format: 'number' }), boxplot('prontos_ciclo_por_unidade_dist', 'Ciclo de venda por unidade (dias)', { format: 'number' })],
    ],
  }),
  page({
    id: 'imobiliaria-funil-comercial', name: 'Funil Comercial',
    description: 'Conversão por etapa, no-show, motivos de perda, migração de estágios e propostas em aberto.',
    rows: [
      [funnel('prontos_funil', 'Funil comercial (prontos)', { colSpan: 3 }), kpi('conversao_lead_venda_pct', 'Conversão lead → fechamento', { format: 'percent', decimals: 2, description: 'Benchmark de mercado ≈ 2,8%' }), kpi('visitas_por_venda', 'Visitas por venda', { format: 'number', decimals: 1 })],
      [kpi('conversao_lead_visita_pct', 'Lead → visita', { format: 'percent', decimals: 1 }), kpi('conversao_visita_proposta_pct', 'Visita → proposta', { format: 'percent', decimals: 1 }), kpi('conversao_proposta_venda_pct', 'Proposta → fechamento', { format: 'percent', decimals: 1 })],
      [kpi('propostas_aceitas_pct', 'Propostas aceitas', { format: 'percent', decimals: 1 }), gauge('no_show_visitas_pct', 'No-show de visitas', { threshold: 25, warnThreshold: 15, reverseScale: true, format: 'percent', decimals: 1 }), chart('motivos_perda', 'Motivos de perda', 'pareto', ['value'], { xAxisKey: 'motivo', colSpan: 2, format: 'number' })],
      [chart('conversao_etapas_serie', 'Conversão por etapa', 'line', ['lead_visita', 'visita_proposta', 'proposta_venda'], { format: 'percent' }), sankey('migracao_estagios_leads', 'Migração de estágios dos leads')],
      [heatmap('funil_corretor_x_etapa', 'Corretor × etapa (taxa de conversão)', { rowLabel: 'Corretor', colLabel: 'Etapa', format: 'percent' })],
      [table('propostas_abertas', 'Propostas em aberto', [col('proposta', 'Proposta'), col('imovel', 'Imóvel'), col('corretor', 'Corretor'), col('unidade', 'Unidade'), col('valor_proposta', 'Valor', 'currency'), col('status', 'Status', 'status-badge'), col('dias_em_aberto', 'Dias', 'number')])],
    ],
  }),
  page({
    id: 'imobiliaria-estoque-captacao', name: 'Estoque & Captação',
    description: 'Carteira de imóveis à venda: volume, idade, giro, captações, exclusividade e imóveis parados.',
    rows: [
      [kpi('estoque_imoveis_venda', 'Imóveis à venda', { format: 'number' }), kpi('estoque_vgv_anunciado', 'VGV anunciado', { format: 'currency' }), kpi('tempo_medio_estoque_dias', 'Tempo médio em estoque', { format: 'number', suffix: ' dias', positiveIsGood: false })],
      [kpi('captacoes_mes', 'Captações no mês', { format: 'number', spark: 'captacoes_serie' }), progress('atingimento_meta_captacao_pct', 'Meta de captação'), kpi('exclusividade_pct', 'Com exclusividade', { format: 'percent', decimals: 1 })],
      [kpi('icca_pct', 'ICCA — captados sobre carteira', { format: 'percent', decimals: 1 }), kpi('giro_estoque_pct', 'Giro do estoque', { format: 'percent', decimals: 1 }), donut('estoque_por_faixa_dias', 'Estoque por tempo de carteira', { format: 'number' })],
      [chart('estoque_serie_por_faixa', 'Evolução do estoque por faixa', 'stacked-bar', ['ate_30', 'de_31_a_90', 'de_91_a_180', 'mais_de_180'], { format: 'number' }), treemap('estoque_por_regiao_tipo', 'Estoque por região e tipo', { format: 'currency' })],
      [scatter('preco_x_dias_estoque', 'Preço × dias em estoque', { xLabel: 'Valor anunciado', yLabel: 'Dias em estoque', xFormat: 'currency', yFormat: 'number' }), chart('captacoes_vs_saidas_serie', 'Entradas × saídas de carteira', 'line', ['captacoes', 'saidas'], { format: 'number' })],
      [table('imoveis_parados_180', 'Imóveis parados há mais de 180 dias', [col('codigo', 'Código'), col('tipo', 'Tipo'), col('regiao', 'Região'), col('valor_anuncio', 'Valor', 'currency'), col('dias_em_estoque', 'Dias', 'number'), col('visitas', 'Visitas', 'number'), col('propostas', 'Propostas', 'number'), col('captador', 'Captador')])],
      [table('ranking_captadores', 'Ranking de captadores', [col('captador', 'Captador'), col('unidade', 'Unidade'), col('captacoes', 'Captações', 'number'), col('exclusivas', 'Exclusivas', 'number'), col('vendidos', 'Vendidos', 'number'), col('tempo_medio_dias', 'Tempo médio (dias)', 'number')], { colSpan: 4 }), donut('saidas_por_motivo', 'Saídas por motivo', { format: 'number' })],
    ],
  }),
];
