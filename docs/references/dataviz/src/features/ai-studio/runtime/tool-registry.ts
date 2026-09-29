import { tool } from 'ai';
import { z } from 'zod';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import type { ToolContext } from '@/features/ai-agents/tools/tool-context';
import { buildAndClause } from '@/features/ai-agents/tools/tool-context';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { safeDate } from '@/features/ai-agents/tools/bqml-utils';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { warmKnownProjectIds } from '@/shared/lib/bigquery/warm-known-project-ids';
import { withRedactedErrors } from './redact-tool-errors';

// —— padrão toolCtx ——
import { createExecuteSqlTool } from '@/features/ai-agents/tools/execute-sql';
import { createBqDryRunSqlTool } from '@/features/ai-agents/tools/bq-dry-run-sql';
import { createGetTableSchemaV2Tool } from '@/features/ai-agents/tools/get-table-schema-v2';
import { createGetSampleDataTool } from '@/features/ai-agents/tools/get-sample-data';
import { createCalculateStatisticsTool } from '@/features/ai-agents/tools/calculate-statistics';
import { createBuildVintageCurvesTool } from '@/features/ai-agents/tools/build-vintage-curves';
import { createBuildTransitionMatrixTool } from '@/features/ai-agents/tools/build-transition-matrix';
import { createCalculateCorrelationsTool } from '@/features/ai-agents/tools/calculate-correlations';
import { createCalculateHhiTool } from '@/features/ai-agents/tools/calculate-hhi';
import { createDecomposeVariationTool } from '@/features/ai-agents/tools/decompose-variation';
import { createRunHypothesisTestTool } from '@/features/ai-agents/tools/run-hypothesis-test';
import { createForecastTimeseriesTool } from '@/features/ai-agents/tools/forecast-timeseries';
import { createCalculatePdLgdTool } from '@/features/ai-agents/tools/calculate-pd-lgd';
import { createBuildSurvivalCurveTool } from '@/features/ai-agents/tools/build-survival-curve';
import { createGenerateEarlyWarningsTool } from '@/features/ai-agents/tools/generate-early-warnings';
import { createCalculateCprCdrTool } from '@/features/ai-agents/tools/calculate-cpr-cdr';
import { createRunClusteringTool } from '@/features/ai-agents/tools/run-clustering';
import { createRunCausalAnalysisTool } from '@/features/ai-agents/tools/run-causal-analysis';
import { createOptimizeAllocationTool } from '@/features/ai-agents/tools/optimize-allocation';
import { createRankActionsTool } from '@/features/ai-agents/tools/rank-actions';
import { createEvaluateImpactTool } from '@/features/ai-agents/tools/evaluate-impact';
import { createDetectAnomaliesTool } from '@/features/ai-agents/tools/detect-anomalies';
import { createCheckEligibilityTool } from '@/features/ai-agents/tools/check-eligibility';
import { createCheckConcentrationLimitsTool } from '@/features/ai-agents/tools/check-concentration-limits';
import { createCheckCovenantTriggersTool } from '@/features/ai-agents/tools/check-covenant-triggers';
import { createGenerateComplianceReportTool } from '@/features/ai-agents/tools/generate-compliance-report';
import { createRunSensitivityTool } from '@/features/ai-agents/tools/run-sensitivity';
import { createRunScenarioTool } from '@/features/ai-agents/tools/run-scenario';
import { createRunMonteCarloTool } from '@/features/ai-agents/tools/run-monte-carlo';
import { createApplyStressMacroTool } from '@/features/ai-agents/tools/apply-stress-macro';
import { createCalculateStressedEclTool } from '@/features/ai-agents/tools/calculate-stressed-ecl';
import { createGetMarketBenchmarksTool } from '@/features/ai-agents/tools/get-market-benchmarks';
import { createCalculateWalTool } from '@/features/ai-agents/tools/calculate-wal';
import { createCalculateExcessSpreadTool } from '@/features/ai-agents/tools/calculate-excess-spread';
import { createCalculateCoverageRatiosTool } from '@/features/ai-agents/tools/calculate-coverage-ratios';
import { createCompareCashflowsTool } from '@/features/ai-agents/tools/compare-cashflows';
import { createDecomposePaymentsTool } from '@/features/ai-agents/tools/decompose-payments';
import { createBqListValidatedQueriesTool } from '@/features/ai-agents/tools/bq-list-validated-queries';
import { createBqSaveValidatedQueryTool } from '@/features/ai-agents/tools/bq-save-validated-query';

// —— BQML (assinatura custom) ——
import { createBqmlListModelsTool } from '@/features/ai-agents/tools/bqml/list-models';
import { createBqmlSuggestModelTool } from '@/features/ai-agents/tools/bqml/suggest-model';
import { createBqmlCreateOrUseModelTool } from '@/features/ai-agents/tools/bqml/create-or-use-model';
import { createBqmlForecastTool } from '@/features/ai-agents/tools/bqml/forecast';
import { createBqmlPredictTool } from '@/features/ai-agents/tools/bqml/predict';
import { createBqmlDetectAnomaliesTool } from '@/features/ai-agents/tools/bqml/detect-anomalies';

// —— schema ——
import { createDescribeRelationshipsTool } from '@/features/ai-agents/tools/schema/describe-relationships';

// —— tenancy custom ——
import { createRecallSimilarSqlTool } from '@/features/ai-agents/tools/recall-similar-sql';
import { createVectorQueryTool } from '@/features/ai-agents/tools/vector-query';

// —— direct refs (export, sem call) ——
import { lookupGlossaryTool } from '@/features/ai-agents/tools/lookup-glossary';
import { searchWebTool } from '@/features/ai-agents/tools/search-web';
import { getBcbIndicatorTool } from '@/features/ai-agents/tools/get-bcb-indicator';
import { parseMacroDataTool } from '@/features/ai-agents/tools/parse-macro-data';
import { sentimentAnalysisTool } from '@/features/ai-agents/tools/sentiment-analysis';
import { extractRegulatoryUpdatesTool } from '@/features/ai-agents/tools/extract-regulatory-updates';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export type ToolFactory = (ctx: AgentDynamicContext, systemKey: string) => unknown | null;

function toolCtxOf(ctx: AgentDynamicContext): ToolContext {
  return {
    dataset: ctx.dataset,
    filters: ctx.filters,
    sessionId: ctx.sessionId,
    clientId: ctx.clientId,
    personaId: ctx.personaId,
  };
}

const VALID_DATASETS = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;

function validateDataset(dataset: string): string {
  if (!VALID_DATASETS.test(dataset)) throw new Error(`Dataset invalido: ${dataset}`);
  return dataset;
}

/**
 * Mapa de tool KEY (do manifest) → factory AI SDK existente. Cobre as keys
 * com factory reutilizável aplicável ao agente analítico. Keys server-bound
 * (recall/list/vector) devolvem null sem tenancy (ADR-0006). Keys do manifest
 * sem entrada aqui são no-op logado em buildToolsFromKeys (não erro).
 */
export const TOOL_REGISTRY: Record<string, ToolFactory> = {
  // —— padrão toolCtx ——
  execute_sql: (ctx) => createExecuteSqlTool(toolCtxOf(ctx)),
  dry_run_sql: (ctx) => createBqDryRunSqlTool(toolCtxOf(ctx)),
  get_table_schema: (ctx) => createGetTableSchemaV2Tool(toolCtxOf(ctx)),
  get_sample_data: (ctx) => createGetSampleDataTool(toolCtxOf(ctx)),
  calculate_statistics: (ctx) => createCalculateStatisticsTool(toolCtxOf(ctx)),
  build_vintage_curves: (ctx) => createBuildVintageCurvesTool(toolCtxOf(ctx)),
  build_transition_matrix: (ctx) => createBuildTransitionMatrixTool(toolCtxOf(ctx)),
  calculate_correlations: (ctx) => createCalculateCorrelationsTool(toolCtxOf(ctx)),
  calculate_hhi: (ctx) => createCalculateHhiTool(toolCtxOf(ctx)),
  decompose_variation: (ctx) => createDecomposeVariationTool(toolCtxOf(ctx)),
  run_hypothesis_test: (ctx) => createRunHypothesisTestTool(toolCtxOf(ctx)),
  forecast_timeseries: (ctx) => createForecastTimeseriesTool(toolCtxOf(ctx)),
  calculate_pd_lgd: (ctx) => createCalculatePdLgdTool(toolCtxOf(ctx)),
  build_survival_curve: (ctx) => createBuildSurvivalCurveTool(toolCtxOf(ctx)),
  generate_early_warnings: (ctx) => createGenerateEarlyWarningsTool(toolCtxOf(ctx)),
  calculate_cpr_cdr: (ctx) => createCalculateCprCdrTool(toolCtxOf(ctx)),
  run_clustering: (ctx) => createRunClusteringTool(toolCtxOf(ctx)),
  run_causal_analysis: (ctx) => createRunCausalAnalysisTool(toolCtxOf(ctx)),
  optimize_allocation: (ctx) => createOptimizeAllocationTool(toolCtxOf(ctx)),
  rank_actions: (ctx) => createRankActionsTool(toolCtxOf(ctx)),
  evaluate_impact: (ctx) => createEvaluateImpactTool(toolCtxOf(ctx)),
  detect_anomalies: (ctx) => createDetectAnomaliesTool(toolCtxOf(ctx)),
  check_eligibility: (ctx) => createCheckEligibilityTool(toolCtxOf(ctx)),
  check_concentration_limits: (ctx) => createCheckConcentrationLimitsTool(toolCtxOf(ctx)),
  check_covenant_triggers: (ctx) => createCheckCovenantTriggersTool(toolCtxOf(ctx)),
  generate_compliance_report: (ctx) => createGenerateComplianceReportTool(toolCtxOf(ctx)),
  run_sensitivity: (ctx) => createRunSensitivityTool(toolCtxOf(ctx)),
  run_scenario: (ctx) => createRunScenarioTool(toolCtxOf(ctx)),
  run_monte_carlo: (ctx) => createRunMonteCarloTool(toolCtxOf(ctx)),
  apply_stress_macro: (ctx) => createApplyStressMacroTool(toolCtxOf(ctx)),
  calculate_stressed_ecl: (ctx) => createCalculateStressedEclTool(toolCtxOf(ctx)),
  get_market_benchmarks: (ctx) => createGetMarketBenchmarksTool(toolCtxOf(ctx)),
  calculate_wal: (ctx) => createCalculateWalTool(toolCtxOf(ctx)),
  calculate_excess_spread: (ctx) => createCalculateExcessSpreadTool(toolCtxOf(ctx)),
  calculate_coverage_ratios: (ctx) => createCalculateCoverageRatiosTool(toolCtxOf(ctx)),
  compare_cashflows: (ctx) => createCompareCashflowsTool(toolCtxOf(ctx)),
  decompose_payments: (ctx) => createDecomposePaymentsTool(toolCtxOf(ctx)),
  // —— BQML (agentId=`${systemKey}_agent`) ——
  // clientId DEVE ser o id do cliente cadastrado (formato slug)
  // — deriveBqmlDataset/normalizeClient o exige e normaliza hífen→underscore no
  // nome de dataset (vila-rosa → dataviz_bqml_vila_rosa). ctx.clientId é o campo
  // correto (tenant); passar ctx.dataset (string de dataset BQ) fazia
  // normalizeClient lançar "Invalid client id". Fallback p/ ctx.dataset só no
  // caminho legado sem clientId resolvido (comportamento inalterado nesse caso).
  bqml_list_models: (ctx) => createBqmlListModelsTool({ clientId: ctx.clientId ?? ctx.dataset }),
  bqml_suggest_model: () => createBqmlSuggestModelTool(),
  bqml_create_or_use_model: (ctx, systemKey) => createBqmlCreateOrUseModelTool({ clientId: ctx.clientId ?? ctx.dataset, dataset: ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  bqml_forecast: (ctx, systemKey) => createBqmlForecastTool({ clientId: ctx.clientId ?? ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  bqml_predict: (ctx, systemKey) => createBqmlPredictTool({ clientId: ctx.clientId ?? ctx.dataset, dataset: ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  bqml_detect_anomalies: (ctx, systemKey) => createBqmlDetectAnomaliesTool({ clientId: ctx.clientId ?? ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  schema_describe_relationships: (ctx) => createDescribeRelationshipsTool({ dataset: ctx.dataset, clientId: ctx.dataset }),
  // —— tenancy custom ——
  recall_similar_sql: (ctx) =>
    ctx.clientId && ctx.personaId ? createRecallSimilarSqlTool({ clientId: ctx.clientId, personaId: ctx.personaId }) : null,
  list_validated_queries: (ctx) =>
    ctx.clientId && ctx.personaId ? createBqListValidatedQueriesTool(toolCtxOf(ctx)) : null,
  save_validated_query: (ctx) =>
    ctx.clientId && ctx.personaId ? createBqSaveValidatedQueryTool(toolCtxOf(ctx)) : null,
  vector_query: (ctx) => (ctx.clientId ? createVectorQueryTool({ clientId: ctx.clientId }) : null),
  // —— direct refs (export, sem call) ——
  lookup_glossary: () => lookupGlossaryTool,
  search_web: () => searchWebTool,
  get_bcb_indicator: () => getBcbIndicatorTool,
  parse_macro_data: () => parseMacroDataTool,
  sentiment_analysis: () => sentimentAnalysisTool,
  extract_regulatory_updates: () => extractRegulatoryUpdatesTool,
  // —— inline relocadas ——
  read_dashboard_state: (ctx) => tool({
    description: 'Retorna o estado atual do dashboard com KPIs visíveis.',
    inputSchema: z.object({}),
    execute: async () => ({ success: true, dashboardState: ctx.dashboardState || null, page: ctx.page }),
  }),
  read_active_filters: (ctx) => tool({
    description: 'Retorna os filtros ativos no dashboard.',
    inputSchema: z.object({}),
    execute: async () => {
      return {
        success: true,
        filters: {
          dateRange: ctx.filters.dateRange,
          viewMode: ctx.filters.viewMode ?? 'snapshot',
          compareEnabled: ctx.filters.compareEnabled,
          comparePeriod: ctx.filters.comparePeriod ?? null,
        },
      };
    },
  }),
  get_baseline: (ctx) => tool({
    description: 'Retorna os valores atuais (baseline) da carteira para comparação com cenários simulados.',
    inputSchema: z.object({
      metrics: z.array(z.string()).optional().describe('Métricas específicas. Se vazio, retorna todas.'),
    }),
    execute: async ({ metrics }: { metrics?: string[] }) => {
      try {
        const bq = getBigQueryClient();
        const dataBase = safeDate(toolCtxOf(ctx).filters.dateRange.end);
        const andClause = buildAndClause(toolCtxOf(ctx), { dateMode: 'none' });
        const dataset = validateDataset(ctx.dataset);
        const [rows] = await bq.query({
          query: `
            SELECT
              COUNT(DISTINCT id_contrato) as total_contratos,
              SUM(saldo_devedor) as saldo_devedor,
              SUM(saldo_nominal) as saldo_nominal,
              AVG(ltv) as ltv_medio,
              SUM(valor_atraso) as valor_atraso,
              SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 as inadimplencia_pct,
              SUM(pdd_liquid) as pdd_liquid_total,
              SUM(pdd_minimo_bacen) as pdd_bacen_total,
              SUM(pricing) as pricing_total,
              SAFE_DIVIDE(SUM(pricing) - SUM(saldo_nominal), SUM(saldo_nominal)) * 100 as desagio_pct,
              COUNTIF(elegibilidade = 'Elegivel') as contratos_elegiveis,
              SAFE_DIVIDE(COUNTIF(elegibilidade = 'Elegivel'), COUNT(DISTINCT id_contrato)) * 100 as pct_elegiveis
            FROM \`${dataset}.contratos\`
            WHERE data_base_report = '${dataBase}' ${andClause}
          `,
          useLegacySql: false,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const baseline = rows[0] ?? {};
        if (metrics && metrics.length > 0) {
          const filtered: Record<string, unknown> = {};
          for (const m of metrics) {
            if (m in baseline) filtered[m] = (baseline as Record<string, unknown>)[m];
          }
          return { success: true, dataBase, baseline: filtered };
        }
        return { success: true, dataBase, baseline };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  }),
};

/**
 * Constrói as tools correspondentes às `keys`. Key sem entrada no registry, ou
 * factory que devolve null (ex.: server-bound sem tenancy), é pulada + logada.
 */
export function buildToolsFromKeys(
  keys: string[],
  ctx: AgentDynamicContext,
  systemKey: string,
): Record<string, unknown> {
  // Ids de projeto dos dataSources para `formatToolError` (também no playground
  // do Mastra, que não passa pela rota do chat). Cache de 5 min; não bloqueia.
  void warmKnownProjectIds();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const factory = TOOL_REGISTRY[key];
    if (!factory) { console.warn(`[ai-studio] toolRef "${key}" sem factory no registry — pulada`); continue; }
    try {
      const built = factory(ctx, systemKey);
      // Erro LANÇADO por qualquer tool sai redigido (ver `redact-tool-errors.ts`).
      if (built) out[key] = withRedactedErrors(built);
      else console.warn(`[ai-studio] toolRef "${key}" não construída (tenancy ausente?) — pulada`);
    } catch (e) { console.warn(`[ai-studio] toolRef "${key}" falhou ao construir — pulada`, e); }
  }
  return out;
}
