/** Tool keys por agente (fonte do seed + fallback do create-mastra). Espelha buildXAgentTools. */
export const DEFAULT_AGENT_TOOLS: Record<string, string[]> = {
  descriptive: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'get_sample_data', 'calculate_statistics', 'build_vintage_curves', 'build_transition_matrix', 'read_dashboard_state', 'read_active_filters', 'lookup_glossary', 'recall_similar_sql', 'list_validated_queries', 'save_validated_query'],
  diagnostic: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'get_sample_data', 'calculate_correlations', 'calculate_hhi', 'decompose_variation', 'run_hypothesis_test', 'list_validated_queries', 'save_validated_query'],
  predictive: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'forecast_timeseries', 'calculate_pd_lgd', 'build_survival_curve', 'generate_early_warnings', 'calculate_cpr_cdr', 'build_vintage_curves', 'build_transition_matrix', 'bqml_list_models', 'bqml_suggest_model', 'bqml_create_or_use_model', 'bqml_forecast', 'bqml_predict', 'bqml_detect_anomalies', 'schema_describe_relationships'],
  prescriptive: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'run_clustering', 'run_causal_analysis', 'optimize_allocation', 'rank_actions', 'evaluate_impact'],
  monitoring: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'detect_anomalies', 'check_eligibility', 'check_concentration_limits', 'check_covenant_triggers', 'generate_compliance_report', 'bqml_list_models', 'bqml_forecast', 'bqml_detect_anomalies'],
  simulation: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'get_baseline', 'run_sensitivity', 'run_scenario', 'run_monte_carlo', 'apply_stress_macro', 'calculate_stressed_ecl'],
  external: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'search_web', 'get_bcb_indicator', 'parse_macro_data', 'sentiment_analysis', 'extract_regulatory_updates', 'get_market_benchmarks'],
  cashflow: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'calculate_wal', 'calculate_excess_spread', 'calculate_coverage_ratios', 'compare_cashflows', 'decompose_payments'],
};
