export type ToolCategory =
  | 'data' | 'stats' | 'bqml' | 'risk' | 'simulation' | 'cashflow' | 'memory' | 'rag' | 'external' | 'export';

export interface ToolDescriptor {
  key: string;
  name: string;
  description: string;
  category: ToolCategory;
}

export const TOOL_MANIFEST: ToolDescriptor[] = [
  // data
  { key: 'execute_sql', name: 'Executar SQL', description: 'Roda uma query no BigQuery do cliente.', category: 'data' },
  { key: 'dry_run_sql', name: 'Validar SQL (dry-run)', description: 'Valida SQL sem executar.', category: 'data' },
  { key: 'get_table_schema', name: 'Schema da tabela', description: 'Introspecção de schema.', category: 'data' },
  { key: 'get_sample_data', name: 'Amostra de dados', description: 'Retorna linhas de amostra.', category: 'data' },
  { key: 'read_dashboard_state', name: 'Estado do dashboard', description: 'KPIs visíveis na tela.', category: 'data' },
  { key: 'read_active_filters', name: 'Filtros ativos', description: 'Filtros aplicados no dashboard.', category: 'data' },
  { key: 'schema_describe_relationships', name: 'Relações de schema', description: 'Descreve relações entre tabelas.', category: 'data' },
  // stats / analytics
  { key: 'calculate_statistics', name: 'Estatísticas', description: 'Agregações estatísticas.', category: 'stats' },
  { key: 'build_vintage_curves', name: 'Curvas de safra', description: 'Curvas de vintage de crédito.', category: 'stats' },
  { key: 'build_transition_matrix', name: 'Matriz de transição', description: 'Migração de rating entre períodos.', category: 'stats' },
  { key: 'calculate_correlations', name: 'Correlações', description: 'Correlações entre variáveis.', category: 'stats' },
  { key: 'calculate_hhi', name: 'HHI', description: 'Índice de concentração Herfindahl-Hirschman.', category: 'stats' },
  { key: 'decompose_variation', name: 'Decompor variação', description: 'Decomposição de variação por dimensão.', category: 'stats' },
  { key: 'run_hypothesis_test', name: 'Teste de hipótese', description: 'Teste estatístico de hipótese.', category: 'stats' },
  { key: 'forecast_timeseries', name: 'Forecast (séries)', description: 'Projeção de série temporal (ARIMA/fallback).', category: 'stats' },
  { key: 'calculate_pd_lgd', name: 'PD/LGD', description: 'Probabilidade de default e perda dado default.', category: 'stats' },
  { key: 'build_survival_curve', name: 'Curva de sobrevivência', description: 'Curva de sobrevivência de contratos.', category: 'stats' },
  { key: 'generate_early_warnings', name: 'Alertas precoces', description: 'Sinais de deterioração.', category: 'stats' },
  { key: 'calculate_cpr_cdr', name: 'CPR/CDR', description: 'Taxas de pré-pagamento e default.', category: 'stats' },
  // bqml
  { key: 'bqml_list_models', name: 'BQML — listar modelos', description: 'Lista modelos BigQuery ML.', category: 'bqml' },
  { key: 'bqml_suggest_model', name: 'BQML — sugerir modelo', description: 'Sugere tipo de modelo BQML.', category: 'bqml' },
  { key: 'bqml_create_or_use_model', name: 'BQML — criar/usar', description: 'Cria ou reusa modelo BQML.', category: 'bqml' },
  { key: 'bqml_forecast', name: 'BQML Forecast', description: 'Previsão via BigQuery ML.', category: 'bqml' },
  { key: 'bqml_predict', name: 'BQML Predict', description: 'Predição via BigQuery ML.', category: 'bqml' },
  { key: 'bqml_detect_anomalies', name: 'BQML Anomalias', description: 'Detecção de anomalias.', category: 'bqml' },
  // prescriptive (risk)
  { key: 'run_clustering', name: 'Clustering', description: 'Agrupa contratos (K-Means).', category: 'risk' },
  { key: 'run_causal_analysis', name: 'Análise causal', description: 'Avaliação de impacto causal.', category: 'risk' },
  { key: 'optimize_allocation', name: 'Otimizar alocação', description: 'Otimização de alocação.', category: 'risk' },
  { key: 'rank_actions', name: 'Priorizar ações', description: 'Ranking multicritério de ações.', category: 'risk' },
  { key: 'evaluate_impact', name: 'Avaliar impacto', description: 'Avaliação de impacto de ações.', category: 'risk' },
  // monitoring (risk)
  { key: 'detect_anomalies', name: 'Detectar anomalias', description: 'Detecção de anomalias nos dados.', category: 'risk' },
  { key: 'check_eligibility', name: 'Checar elegibilidade', description: 'Elegibilidade CRI.', category: 'risk' },
  { key: 'check_concentration_limits', name: 'Limites de concentração', description: 'Limites CVM 60.', category: 'risk' },
  { key: 'check_covenant_triggers', name: 'Covenants', description: 'Gatilhos de covenants.', category: 'risk' },
  { key: 'generate_compliance_report', name: 'Relatório de compliance', description: 'Relatório de compliance.', category: 'risk' },
  // simulation
  { key: 'get_baseline', name: 'Baseline', description: 'Valores atuais da carteira p/ comparação.', category: 'simulation' },
  { key: 'run_sensitivity', name: 'Sensibilidade', description: 'Análise de sensibilidade OAT.', category: 'simulation' },
  { key: 'run_scenario', name: 'Cenário', description: 'Cenário determinístico.', category: 'simulation' },
  { key: 'run_monte_carlo', name: 'Monte Carlo', description: 'Simulação de Monte Carlo.', category: 'simulation' },
  { key: 'apply_stress_macro', name: 'Stress macro', description: 'Aplica choque macroeconômico.', category: 'simulation' },
  { key: 'calculate_stressed_ecl', name: 'ECL estressado', description: 'ECL sob cenário de stress.', category: 'simulation' },
  // cashflow
  { key: 'calculate_wal', name: 'WAL', description: 'Weighted Average Life.', category: 'cashflow' },
  { key: 'calculate_excess_spread', name: 'Excess spread', description: 'Excedente estrutural.', category: 'cashflow' },
  { key: 'calculate_coverage_ratios', name: 'Coverage ratios', description: 'OC/IC ratios.', category: 'cashflow' },
  { key: 'compare_cashflows', name: 'Comparar fluxos', description: 'Esperado vs contratado.', category: 'cashflow' },
  { key: 'decompose_payments', name: 'Decompor pagamentos', description: 'Pagamentos por tipo.', category: 'cashflow' },
  // memory
  { key: 'lookup_glossary', name: 'Glossário', description: 'Consulta termos do glossário.', category: 'memory' },
  { key: 'recall_similar_sql', name: 'Recall de SQL', description: 'Busca semântica de SQL similar (ADR-0011).', category: 'memory' },
  { key: 'list_validated_queries', name: 'Catálogo de SQL', description: 'Lista queries curadas (ADR-0009).', category: 'memory' },
  { key: 'save_validated_query', name: 'Salvar SQL', description: 'Sugere SQL ao catálogo (gate humano).', category: 'memory' },
  // rag
  { key: 'vector_query', name: 'Busca RAG', description: 'Recupera documentos por similaridade.', category: 'rag' },
  // external
  { key: 'search_web', name: 'Busca web', description: 'Busca dados externos.', category: 'external' },
  { key: 'get_bcb_indicator', name: 'Indicador BCB', description: 'Indicadores do Banco Central.', category: 'external' },
  { key: 'parse_macro_data', name: 'Parse macro', description: 'Estrutura dados macro.', category: 'external' },
  { key: 'sentiment_analysis', name: 'Sentimento', description: 'Análise de sentimento.', category: 'external' },
  { key: 'extract_regulatory_updates', name: 'Atualizações regulatórias', description: 'Extrai novidades regulatórias.', category: 'external' },
  { key: 'get_market_benchmarks', name: 'Benchmarks de mercado', description: 'Benchmarks de CRI/mercado.', category: 'external' },
];

const KEYS = new Set(TOOL_MANIFEST.map((t) => t.key));
export function hasTool(key: string): boolean { return KEYS.has(key); }
export function listTools(): ToolDescriptor[] { return TOOL_MANIFEST; }
