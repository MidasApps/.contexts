import { describe, it, expect, vi } from 'vitest';

// Avoid hitting Vertex/embeddings or BQ during tool factory construction.
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({ query: vi.fn(), createQueryJob: vi.fn() }),
  parseDatasetRef: (ds: string) => ({ datasetId: ds, projectId: undefined }),
}));
vi.mock('@ai-sdk/google-vertex', () => ({
  vertex: { textEmbeddingModel: () => ({}) },
}));

import { DEFAULT_AGENT_TOOLS } from '@/shared/config/agents/default-agent-tools';
import { buildToolsFromKeys } from '@/features/ai-studio/runtime/tool-registry';

/**
 * Paridade de tools por sub-agente.
 *
 * Este teste comparava `buildToolsFromKeys(DEFAULT_AGENT_TOOLS[k])` contra as
 * factories `buildXAgentTools` do runtime AI SDK v6 — que era o oráculo da
 * migração para Mastra (ADR-0014). Esse runtime foi removido: ficou inalcançável
 * depois que os 8 sub-agentes passaram a ser construídos em
 * `mastra/*-agent-mastra.ts`, e mantê-lo vivo só para servir de oráculo
 * significaria carregar ~800 LOC mortas.
 *
 * O oráculo foi congelado no estado em que a paridade era verificada — a lista
 * abaixo é exatamente o que as factories legadas produziam. A garantia que
 * importa continua de pé: se alguém mexer em DEFAULT_AGENT_TOOLS ou no
 * tool-registry e o conjunto real divergir, isto quebra.
 */
const EXPECTED: Record<string, { tenancy: string[]; noTenancy: string[] }> = {
  descriptive: {
    tenancy: ["build_transition_matrix","build_vintage_curves","calculate_statistics","dry_run_sql","execute_sql","get_sample_data","get_table_schema","list_validated_queries","lookup_glossary","read_active_filters","read_dashboard_state","recall_similar_sql","save_validated_query"],
    noTenancy: ["build_transition_matrix","build_vintage_curves","calculate_statistics","dry_run_sql","execute_sql","get_sample_data","get_table_schema","lookup_glossary","read_active_filters","read_dashboard_state"],
  },
  diagnostic: {
    tenancy: ["calculate_correlations","calculate_hhi","decompose_variation","dry_run_sql","execute_sql","get_sample_data","get_table_schema","list_validated_queries","run_hypothesis_test","save_validated_query"],
    noTenancy: ["calculate_correlations","calculate_hhi","decompose_variation","dry_run_sql","execute_sql","get_sample_data","get_table_schema","run_hypothesis_test"],
  },
  predictive: {
    tenancy: ["bqml_create_or_use_model","bqml_detect_anomalies","bqml_forecast","bqml_list_models","bqml_predict","bqml_suggest_model","build_survival_curve","build_transition_matrix","build_vintage_curves","calculate_cpr_cdr","calculate_pd_lgd","dry_run_sql","execute_sql","forecast_timeseries","generate_early_warnings","get_table_schema","schema_describe_relationships"],
    noTenancy: ["bqml_create_or_use_model","bqml_detect_anomalies","bqml_forecast","bqml_list_models","bqml_predict","bqml_suggest_model","build_survival_curve","build_transition_matrix","build_vintage_curves","calculate_cpr_cdr","calculate_pd_lgd","dry_run_sql","execute_sql","forecast_timeseries","generate_early_warnings","get_table_schema","schema_describe_relationships"],
  },
  prescriptive: {
    tenancy: ["dry_run_sql","evaluate_impact","execute_sql","get_table_schema","optimize_allocation","rank_actions","run_causal_analysis","run_clustering"],
    noTenancy: ["dry_run_sql","evaluate_impact","execute_sql","get_table_schema","optimize_allocation","rank_actions","run_causal_analysis","run_clustering"],
  },
  monitoring: {
    tenancy: ["bqml_detect_anomalies","bqml_forecast","bqml_list_models","check_concentration_limits","check_covenant_triggers","check_eligibility","detect_anomalies","dry_run_sql","execute_sql","generate_compliance_report","get_table_schema"],
    noTenancy: ["bqml_detect_anomalies","bqml_forecast","bqml_list_models","check_concentration_limits","check_covenant_triggers","check_eligibility","detect_anomalies","dry_run_sql","execute_sql","generate_compliance_report","get_table_schema"],
  },
  simulation: {
    tenancy: ["apply_stress_macro","calculate_stressed_ecl","dry_run_sql","execute_sql","get_baseline","get_table_schema","run_monte_carlo","run_scenario","run_sensitivity"],
    noTenancy: ["apply_stress_macro","calculate_stressed_ecl","dry_run_sql","execute_sql","get_baseline","get_table_schema","run_monte_carlo","run_scenario","run_sensitivity"],
  },
  external: {
    tenancy: ["dry_run_sql","execute_sql","extract_regulatory_updates","get_bcb_indicator","get_market_benchmarks","get_table_schema","parse_macro_data","search_web","sentiment_analysis"],
    noTenancy: ["dry_run_sql","execute_sql","extract_regulatory_updates","get_bcb_indicator","get_market_benchmarks","get_table_schema","parse_macro_data","search_web","sentiment_analysis"],
  },
  cashflow: {
    tenancy: ["calculate_coverage_ratios","calculate_excess_spread","calculate_wal","compare_cashflows","decompose_payments","dry_run_sql","execute_sql","get_table_schema"],
    noTenancy: ["calculate_coverage_ratios","calculate_excess_spread","calculate_wal","compare_cashflows","decompose_payments","dry_run_sql","execute_sql","get_table_schema"],
  },
};

function ctx(tenancy: boolean) {
  return {
    dataset: 'vila-rosa',
    filters: { dateRange: { start: '2025-01-01', end: '2025-12-31' }, projetos: [], advancedFilters: {}, compareEnabled: false },
    dashboardState: '', page: '/', sessionId: 's',
    ...(tenancy ? { clientId: 'vila-rosa', personaId: 'cfo' } : {}),
  } as never;
}

describe('paridade de tools por sub-agente (baseline congelado do runtime legado)', () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    it(`${key} (com tenancy) — mesmas keys`, () => {
      expect(Object.keys(buildToolsFromKeys(DEFAULT_AGENT_TOOLS[key], ctx(true), key)).sort()).toEqual(expected.tenancy);
    });
    it(`${key} (sem tenancy) — mesmas keys`, () => {
      expect(Object.keys(buildToolsFromKeys(DEFAULT_AGENT_TOOLS[key], ctx(false), key)).sort()).toEqual(expected.noTenancy);
    });
  }

  // Afirma sobre o comportamento real, não sobre a constante acima: sem
  // clientId o registry precisa DERRUBAR as tools de catálogo SQL, que são
  // tenant-scoped. É a metade do baseline que carrega risco de segurança.
  it('sem clientId, as tools de catálogo SQL somem de descriptive/diagnostic', () => {
    const gated = ['list_validated_queries', 'save_validated_query', 'recall_similar_sql'];
    for (const key of ['descriptive', 'diagnostic']) {
      const withoutTenancy = Object.keys(buildToolsFromKeys(DEFAULT_AGENT_TOOLS[key], ctx(false), key));
      const withTenancy = Object.keys(buildToolsFromKeys(DEFAULT_AGENT_TOOLS[key], ctx(true), key));
      const dropped = gated.filter((g) => withTenancy.includes(g) && !withoutTenancy.includes(g));
      expect(dropped.length).toBeGreaterThan(0);
      for (const g of gated) expect(withoutTenancy).not.toContain(g);
    }
  });

  it('DEFAULT_AGENT_TOOLS cobre exatamente os 8 sub-agentes esperados', () => {
    expect(Object.keys(DEFAULT_AGENT_TOOLS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
});
