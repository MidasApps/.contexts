/** Grupo D — Locação: 4 páginas. */
import { page, kpi, gauge, progress, donut, chart, scatter, heatmap, table, boxplot, sankey, col } from './_blocks.mjs';

export const templates = [
  page({
    id: 'imobiliaria-locacao-painel', name: 'Painel de Locação',
    description: 'Carteira administrada, receita recorrente, novos contratos, inadimplência e vacância.',
    rows: [
      [kpi('loc_contratos_ativos', 'Contratos ativos', { format: 'number' }), kpi('loc_valor_administrado_mes', 'Aluguel administrado', { format: 'currency' }), kpi('loc_receita_taxa_adm_mes', 'Receita de taxa de administração', { format: 'currency' })],
      [kpi('loc_taxa_adm_media_pct', 'Taxa média', { format: 'percent', decimals: 1 }), kpi('loc_novos_contratos_mes', 'Novos contratos', { format: 'number' }), kpi('loc_receita_intermediacao_mes', 'Receita de intermediação', { format: 'currency' })],
      [kpi('loc_aluguel_medio', 'Aluguel médio', { format: 'currency' }), kpi('loc_tempo_medio_para_alugar', 'Tempo para alugar', { format: 'number', suffix: ' dias', positiveIsGood: false }), progress('loc_atingimento_meta_pct', 'Meta de locações')],
      [gauge('loc_inadimplencia_pct', 'Inadimplência', { threshold: 5, warnThreshold: 3, reverseScale: true, format: 'percent', decimals: 1, description: 'Média nacional ≈ 3,2%' }), gauge('loc_vacancia_pct', 'Vacância', { threshold: 12, warnThreshold: 8, reverseScale: true, format: 'percent', decimals: 1 }), donut('loc_mix_garantia', 'Contratos por garantia', { format: 'number' })],
      [chart('loc_carteira_serie', 'Carteira: ativos, novos e encerrados', 'composed', ['ativos', 'novos', 'encerrados'], { format: 'number' }), chart('loc_receita_recorrente_serie', 'Receita recorrente mensal', 'area', ['value'], { format: 'currency' })],
      [chart('loc_contratos_por_tipo', 'Contratos por tipo', 'bar', ['value'], { xAxisKey: 'tipo', format: 'number' }), chart('loc_contratos_por_unidade', 'Contratos por unidade', 'bar', ['value'], { xAxisKey: 'unidade', format: 'number' })],
    ],
  }),
  page({
    id: 'imobiliaria-carteira-administrada', name: 'Carteira Administrada',
    description: 'Churn, renovação, duração, valor estimado da carteira, vencimentos e reajustes.',
    rows: [
      [kpi('loc_churn_contratos_pct', 'Churn de contratos', { format: 'percent', decimals: 2, positiveIsGood: false }), kpi('loc_churn_proprietarios_pct', 'Churn de proprietários', { format: 'percent', decimals: 2, positiveIsGood: false }), kpi('loc_renovacao_pct', 'Taxa de renovação', { format: 'percent', decimals: 1 })],
      [kpi('loc_duracao_media_meses', 'Duração média', { format: 'number', suffix: ' meses' }), kpi('loc_valor_carteira_estimado', 'Valor estimado da carteira', { format: 'currency', description: '12 × receita mensal de taxa de administração' }), donut('loc_encerramentos_por_motivo', 'Encerramentos por motivo', { format: 'number' })],
      [sankey('loc_migracao_status_contratos', 'Migração de status dos contratos'), chart('loc_distribuicao_aluguel', 'Distribuição do aluguel', 'histogram', ['value'], { xAxisKey: 'bucket', format: 'number' })],
      [boxplot('loc_aluguel_por_regiao_dist', 'Aluguel por região', { format: 'currency' }), heatmap('loc_carteira_regiao_x_tipo', 'Carteira: região × tipo', { rowLabel: 'Região', colLabel: 'Tipo', format: 'number', colSpan: 3 })],
      [table('loc_vencimentos_90_dias', 'Contratos vencendo em 90 dias', [col('contrato', 'Contrato'), col('imovel', 'Imóvel'), col('unidade', 'Unidade'), col('valor_aluguel', 'Aluguel', 'currency'), col('data_fim_prevista', 'Vencimento', 'date'), col('indice_reajuste', 'Índice'), col('garantia', 'Garantia')])],
      [table('loc_reajustes_mes', 'Reajustes do mês', [col('contrato', 'Contrato'), col('unidade', 'Unidade'), col('valor_aluguel', 'Aluguel', 'currency'), col('indice_reajuste', 'Índice'), col('aniversario', 'Aniversário', 'date')])],
    ],
  }),
  page({
    id: 'imobiliaria-inadimplencia-repasses', name: 'Inadimplência & Repasses',
    description: 'Valor e quantidade em atraso, aging, recuperação, acordos e repasses a proprietários.',
    rows: [
      [kpi('loc_inadimplencia_valor', 'Valor em atraso', { format: 'currency', positiveIsGood: false }), kpi('loc_inadimplencia_qtd', 'Faturas em atraso', { format: 'number', positiveIsGood: false }), kpi('loc_atraso_medio_dias', 'Atraso médio', { format: 'number', suffix: ' dias', positiveIsGood: false })],
      [kpi('loc_recuperacao_pct', 'Recuperação de atrasos', { format: 'percent', decimals: 1 }), kpi('loc_acordos_ativos', 'Acordos ativos', { format: 'number' }), kpi('loc_repasse_garantido_pct', 'Repasse garantido', { format: 'percent', decimals: 1 })],
      [chart('loc_aging_serie', 'Aging da carteira', 'stacked-bar', ['em_dia', 'ate_30', 'de_31_a_60', 'de_61_a_90', 'mais_de_90'], { format: 'number', stackOffset: 'expand' }), chart('loc_inadimplencia_serie', 'Inadimplência mensal', 'line', ['value'], { format: 'percent' })],
      [chart('loc_inadimplencia_por_unidade', 'Inadimplência por unidade', 'bar', ['value'], { xAxisKey: 'unidade', format: 'percent' }), chart('loc_inadimplencia_por_garantia', 'Inadimplência por garantia', 'bar', ['value'], { xAxisKey: 'garantia', format: 'percent' })],
      [kpi('loc_repasses_mes', 'Repasses no mês', { format: 'currency', colSpan: 3 }), kpi('loc_repasses_no_prazo_pct', 'Repasses no prazo', { format: 'percent', decimals: 1, colSpan: 3 })],
      [table('loc_faturas_em_atraso', 'Faturas em atraso', [col('contrato', 'Contrato'), col('imovel', 'Imóvel'), col('unidade', 'Unidade'), col('competencia', 'Competência', 'date'), col('valor_total', 'Valor', 'currency'), col('dias_atraso', 'Dias', 'number'), col('garantia', 'Garantia'), col('status', 'Status', 'status-badge')])],
    ],
  }),
  page({
    id: 'imobiliaria-vacancia-renovacoes', name: 'Vacância & Renovações',
    description: 'Imóveis vagos, tempo de vacância, aluguel não realizado e imóveis parados há mais de 90 dias.',
    rows: [
      [kpi('loc_imoveis_vagos', 'Imóveis vagos', { format: 'number', positiveIsGood: false }), kpi('loc_vacancia_media_dias', 'Vacância média', { format: 'number', suffix: ' dias', positiveIsGood: false }), kpi('loc_aluguel_perdido_mes', 'Aluguel não realizado', { format: 'currency', positiveIsGood: false })],
      [donut('loc_vagos_por_faixa_dias', 'Vagos por tempo', { format: 'number' }), chart('loc_vacancia_serie', 'Vacância mensal', 'line', ['value'], { format: 'percent', colSpan: 4 })],
      [scatter('loc_aluguel_x_dias_vago', 'Aluguel × dias vago', { xLabel: 'Aluguel anunciado', yLabel: 'Dias vago', xFormat: 'currency', yFormat: 'number', colSpan: 6 })],
      [table('loc_vagos_90_dias', 'Vagos há mais de 90 dias', [col('codigo', 'Código'), col('regiao', 'Região'), col('tipo', 'Tipo'), col('valor_aluguel_anuncio', 'Aluguel', 'currency'), col('dias_vago', 'Dias vago', 'number'), col('visitas', 'Visitas', 'number')])],
    ],
  }),
];
