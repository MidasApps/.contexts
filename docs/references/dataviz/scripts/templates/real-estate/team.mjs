/** Grupo G — Equipe: 3 páginas (a terceira é o painel do corretor). */
import { page, kpi, progress, targets, chart, scatter, heatmap, table, boxplot, funnel, col } from './_blocks.mjs';

/**
 * "Meu Painel": o recorte por corretor é um filtro de página `in` com
 * dropdown (ADR-0026). Sem seleção, as métricas `meu_*` caem em `1=1` e
 * mostram o time inteiro — o corretor escolhe o próprio nome no seletor.
 * O recorte automático pelo usuário logado é extensão a decidir (ADR-0018).
 */
const MY_DASHBOARD_FILTERS = {
  metricPageFilters: {
    snapshot: { kind: 'snapshot', attribute: 'estoque_snapshot.data_base_report' },
    date_range: { kind: 'date_range', attribute: 'estoque_snapshot.data_base_report' },
    corretor: { kind: 'in', attribute: 'corretores.corretor_id', labelAttribute: 'corretores.nome', control: 'dropdown', label: 'Corretor' },
  },
};

export const templates = [
  page({
    id: 'imobiliaria-ranking-corretores', name: 'Ranking de Corretores',
    description: 'Produção por corretor: leads, visitas, propostas, vendas, locações, VGV, comissão e metas.',
    rows: [
      [table('eq_ranking_corretores', 'Ranking de corretores', [col('corretor', 'Corretor'), col('unidade', 'Unidade'), col('departamento', 'Depto'), col('leads', 'Leads', 'number'), col('visitas', 'Visitas', 'number'), col('propostas', 'Propostas', 'number'), col('vendas', 'Vendas', 'number'), col('locacoes', 'Locações', 'number'), col('vgv', 'VGV', 'currency'), col('comissao', 'Comissão', 'currency'), col('conversao_pct', 'Conversão', 'percent'), col('atingimento_pct', 'Meta', 'percent')])],
      [chart('eq_vgv_por_corretor_top20', 'Top 20 por VGV', 'bar', ['value'], { xAxisKey: 'corretor', format: 'currency' }), chart('eq_locacoes_por_corretor_top20', 'Top 20 por locações', 'bar', ['value'], { xAxisKey: 'corretor', format: 'number' })],
      [targets('eq_metas_por_corretor', 'Metas individuais de VGV', { colSpan: 3, display: 'list' }), boxplot('eq_vgv_por_corretor_dist_unidade', 'VGV por corretor, por unidade (12 m)', { format: 'currency' })],
      [heatmap('eq_corretor_x_mes_vgv', 'VGV por corretor e mês (top 25)', { rowLabel: 'Corretor', colLabel: 'Mês', format: 'currency' })],
      [chart('eq_concentracao_vgv', 'Concentração de VGV por corretor', 'pareto', ['value'], { xAxisKey: 'bucket', format: 'currency', colSpan: 6 })],
    ],
  }),
  page({
    id: 'imobiliaria-produtividade', name: 'Produtividade',
    description: 'Produção média por corretor, cobertura de leads, ramp-up, turnover e leads sem atendimento.',
    rows: [
      [kpi('eq_corretores_ativos', 'Corretores ativos', { format: 'number' }), kpi('eq_vgv_por_corretor', 'VGV por corretor', { format: 'currency' }), kpi('eq_leads_por_corretor', 'Leads por corretor', { format: 'number', decimals: 1 })],
      [kpi('eq_visitas_por_corretor', 'Visitas por corretor', { format: 'number', decimals: 1 }), kpi('eq_interacoes_por_lead', 'Interações por lead', { format: 'number', decimals: 1 }), kpi('eq_corretores_sem_venda_90d_pct', 'Sem venda em 90 dias', { format: 'percent', decimals: 1, positiveIsGood: false })],
      [kpi('eq_turnover_pct', 'Turnover (12 m)', { format: 'percent', decimals: 1, positiveIsGood: false }), kpi('eq_ramp_up_dias', 'Ramp-up até a 1ª venda', { format: 'number', suffix: ' dias', positiveIsGood: false }), chart('eq_distribuicao_vendas_por_corretor', 'Corretores por faixa de vendas', 'histogram', ['value'], { xAxisKey: 'bucket', colSpan: 2, format: 'number' })],
      [chart('eq_produtividade_serie', 'Produtividade mensal', 'line', ['vgv_por_corretor', 'vendas_por_corretor'], { format: 'currency' }), scatter('eq_leads_x_vendas_corretor', 'Leads × vendas por corretor (12 m)', { xLabel: 'Leads', yLabel: 'Vendas', xFormat: 'number', yFormat: 'number' })],
      [table('eq_leads_sem_contato_24h', 'Leads sem contato em 24 h', [col('corretor', 'Corretor'), col('unidade', 'Unidade'), col('leads_sem_contato', 'Sem contato', 'number'), col('leads_total', 'Leads', 'number')])],
    ],
  }),
  page({
    id: 'imobiliaria-meu-painel', name: 'Meu Painel',
    description: 'Visão do corretor: meta, leads por estágio, visitas, propostas, comissão a receber e posição no ranking. Escolha o corretor no seletor.',
    filters: MY_DASHBOARD_FILTERS,
    rows: [
      [kpi('meu_vgv_mes', 'Meu VGV do mês', { format: 'currency', spark: 'meu_vgv_serie' }), progress('meu_atingimento_meta_pct', 'Minha meta'), kpi('minha_posicao_ranking', 'Posição no ranking da unidade', { format: 'number', suffix: 'º' })],
      [kpi('meus_leads_ativos', 'Leads ativos', { format: 'number' }), kpi('meus_leads_novos_sem_contato', 'Novos sem contato', { format: 'number', positiveIsGood: false }), kpi('minhas_visitas_semana', 'Visitas na semana', { format: 'number' })],
      [kpi('minhas_propostas_abertas', 'Propostas em aberto', { format: 'number' }), kpi('minha_comissao_a_receber', 'Comissão a receber', { format: 'currency' }), funnel('meu_funil', 'Meu funil', { colSpan: 2 })],
      [chart('meu_vgv_serie', 'Meu VGV mensal', 'bar', ['value'], { format: 'currency', colSpan: 6 })],
      [table('meus_leads_por_estagio', 'Meus leads por estágio', [col('lead', 'Lead'), col('origem', 'Origem'), col('interesse', 'Interesse'), col('estagio', 'Estágio', 'status-badge'), col('ultima_interacao', 'Última interação', 'date'), col('dias_parado', 'Dias parado', 'number')])],
      [table('minhas_visitas_agenda', 'Minha agenda de visitas', [col('data', 'Data', 'date'), col('imovel', 'Imóvel'), col('lead', 'Lead'), col('status', 'Status', 'status-badge')], { colSpan: 3 }), table('minhas_propostas', 'Minhas propostas', [col('proposta', 'Proposta'), col('imovel', 'Imóvel'), col('valor_proposta', 'Valor', 'currency'), col('status', 'Status', 'status-badge'), col('dias', 'Dias', 'number')], { colSpan: 3 })],
    ],
  }),
];
