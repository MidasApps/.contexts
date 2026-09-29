/** Grupo H — Atendimento & Clientes: 3 páginas. */
import { page, kpi, gauge, donut, chart, heatmap, table, col } from './_blocks.mjs';

export const templates = [
  page({
    id: 'imobiliaria-tempo-resposta', name: 'Tempo de Resposta',
    description: 'SLA de primeiro contato: mediana, leads respondidos em 1 h, sem contato e sem interação.',
    rows: [
      [gauge('at_tempo_primeiro_contato_min', 'Tempo até o 1º contato (mediana)', { threshold: 60, warnThreshold: 30, reverseScale: true, format: 'number', suffix: ' min', decimals: 0 }), kpi('at_leads_respondidos_1h_pct', 'Respondidos em até 1 h', { format: 'percent', decimals: 1 }), kpi('at_leads_sem_contato_24h', 'Sem contato em 24 h', { format: 'number', positiveIsGood: false })],
      [kpi('at_leads_sem_interacao_7d', 'Abertos sem interação há 7 dias', { format: 'number', positiveIsGood: false, colSpan: 2 }), chart('at_tempo_resposta_serie', 'Tempo de resposta mensal (mediana, min)', 'line', ['value'], { format: 'number', colSpan: 4 })],
      [chart('at_tempo_resposta_por_unidade', 'Tempo de resposta por unidade (min)', 'bar', ['value'], { xAxisKey: 'unidade', format: 'number', colSpan: 6 })],
      [heatmap('at_tempo_resposta_dia_x_hora', 'Tempo de resposta por dia e hora (min)', { rowLabel: 'Dia', colLabel: 'Hora', format: 'number', highIsBad: true })],
      [table('at_leads_atrasados', 'Leads com resposta atrasada', [col('lead', 'Lead'), col('origem', 'Origem'), col('unidade', 'Unidade'), col('corretor', 'Corretor'), col('horas_sem_contato', 'Horas', 'number')])],
    ],
  }),
  page({
    id: 'imobiliaria-satisfacao', name: 'Satisfação (NPS)',
    description: 'NPS de compradores, proprietários e inquilinos, por unidade e por corretor.',
    rows: [
      [kpi('nps_compradores', 'NPS compradores', { format: 'number', decimals: 0 }), kpi('nps_proprietarios', 'NPS proprietários', { format: 'number', decimals: 0 }), kpi('nps_inquilinos', 'NPS inquilinos', { format: 'number', decimals: 0 })],
      [kpi('nps_respostas_mes', 'Respostas no mês', { format: 'number', colSpan: 2 }), chart('nps_serie', 'NPS mensal por público', 'line', ['compradores', 'proprietarios', 'inquilinos'], { format: 'number', colSpan: 4 })],
      [chart('nps_por_unidade', 'NPS por unidade (12 m)', 'bar', ['value'], { xAxisKey: 'unidade', format: 'number' }), chart('nps_por_corretor_top', 'NPS por corretor (12 m, mín. 20 respostas)', 'bar', ['value'], { xAxisKey: 'corretor', format: 'number' })],
      [donut('nps_distribuicao', 'Promotores, neutros e detratores', { format: 'number', colSpan: 6, display: 'bar' })],
    ],
  }),
  page({
    id: 'imobiliaria-pos-venda-distratos', name: 'Pós-venda & Distratos',
    description: 'Distratos no mês e em 12 meses, VGV distratado, motivos e empreendimentos.',
    rows: [
      [kpi('pv_distratos_mes', 'Distratos no mês', { format: 'number', positiveIsGood: false }), kpi('pv_distrato_pct_12m', 'Taxa de distrato (12 m)', { format: 'percent', decimals: 1, positiveIsGood: false }), kpi('pv_vgv_distratado_mes', 'VGV distratado', { format: 'currency', positiveIsGood: false })],
      [chart('pv_distratos_por_motivo', 'Distratos por motivo', 'bar', ['value'], { xAxisKey: 'motivo', format: 'number' }), chart('pv_distratos_por_empreendimento', 'Distratos por empreendimento', 'bar', ['value'], { xAxisKey: 'empreendimento', format: 'number' })],
      [chart('pv_distrato_serie', 'Taxa de distrato mensal', 'line', ['value'], { format: 'percent', colSpan: 6 })],
      [table('pv_distratos_lista', 'Distratos (12 m)', [col('venda', 'Venda'), col('referencia', 'Referência'), col('corretor', 'Corretor'), col('valor_venda', 'Valor', 'currency'), col('motivo', 'Motivo'), col('dias_apos_venda', 'Dias após a venda', 'number')])],
    ],
  }),
];
