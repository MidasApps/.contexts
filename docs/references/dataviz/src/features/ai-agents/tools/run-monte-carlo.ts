import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeColumn } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

export function createRunMonteCarloTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Simulação de distribuição de perdas via BigQuery ML (ARIMA_PLUS com múltiplos intervalos de confiança). Retorna percentis de perda (VaR/CVaR). Fallback para cenários determinísticos.',
    inputSchema: z.object({
      metric: z.string().default('valor_atraso').describe('Métrica de perda para simular.'),
      horizonte: z.number().int().default(12).describe('Horizonte em meses.'),
      aggregation: z.enum(['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT']).default('SUM').describe('Agregação mensal. Use COUNT_DISTINCT para contar valores únicos.'),
    }),
    execute: async ({ metric, horizonte: horizon, aggregation }) => {
      const col = safeColumn(metric);
      const rawAgg = aggregation || 'SUM';
      const aggExpr = rawAgg === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${col})` : `${rawAgg}(${col})`;
      const model = sessionModelRef(dataset, `mc_arima_${col}_${rawAgg.toLowerCase()}`, ctx.sessionId);

      // ---------- Try BQML ARIMA_PLUS with multiple confidence levels ----------
      try {
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${model}
           OPTIONS(
             model_type = 'ARIMA_PLUS',
             time_series_timestamp_col = 'mes',
             time_series_data_col = 'valor',
             auto_arima = TRUE,
             data_frequency = 'MONTHLY',
             clean_spikes_and_dips = TRUE
           ) AS
           SELECT
             DATE_TRUNC(data_base_report, MONTH) AS mes,
             ${aggExpr} AS valor
           FROM \`${dataset}.contratos\`
           WHERE 1=1 ${buildAndClause(ctx, { dateMode: 'none' })}
           GROUP BY mes
           ORDER BY mes`,
        );

        // Query forecasts at multiple confidence levels to build loss distribution
        const confidenceLevels = [0.50, 0.75, 0.90, 0.95, 0.99];
        const allForecasts = await Promise.all(
          confidenceLevels.map((cl) =>
            queryBQML(
              dataset,
              `SELECT
                 forecast_timestamp,
                 forecast_value,
                 prediction_interval_lower_bound AS lower,
                 prediction_interval_upper_bound AS upper,
                 ${cl} AS confidence_level
               FROM ML.FORECAST(MODEL ${model},
                 STRUCT(${horizon} AS horizon, ${cl} AS confidence_level))
               ORDER BY forecast_timestamp`,
            ),
          ),
        );

        // Build distribution from confidence intervals
        const distribution: Record<string, unknown>[] = [];
        const lastForecastByLevel: Record<number, { lower: number; upper: number; forecast: number }> = {};

        for (let i = 0; i < confidenceLevels.length; i++) {
          const cl = confidenceLevels[i];
          const forecasts = allForecasts[i];
          if (forecasts.length > 0) {
            const last = forecasts[forecasts.length - 1];
            lastForecastByLevel[cl] = {
              lower: Number(last.lower ?? 0),
              upper: Number(last.upper ?? 0),
              forecast: Number(last.forecast_value ?? 0),
            };
          }
        }

        // Extract VaR-like metrics from confidence intervals
        const forecast50 = lastForecastByLevel[0.50];
        const forecast95 = lastForecastByLevel[0.95];
        const forecast99 = lastForecastByLevel[0.99];

        const varMetrics = {
          expected_loss: forecast50?.forecast ?? 0,
          var_95: forecast95?.upper ?? 0,
          var_99: forecast99?.upper ?? 0,
          best_case_95: forecast95?.lower ?? 0,
          worst_case_95: forecast95?.upper ?? 0,
          best_case_99: forecast99?.lower ?? 0,
          worst_case_99: forecast99?.upper ?? 0,
        };

        // Build percentile table
        for (const cl of confidenceLevels) {
          const data = lastForecastByLevel[cl];
          if (data) {
            distribution.push({
              percentile: `${cl * 100}%`,
              lower_bound: data.lower,
              forecast: data.forecast,
              upper_bound: data.upper,
              range: data.upper - data.lower,
            });
          }
        }

        return {
          success: true,
          method: 'BQML_ARIMA_PLUS_DISTRIBUTION',
          metric: col,
          horizonte: horizon,
          var_metrics: varMetrics,
          distribution,
          forecast_by_month: allForecasts[2], // 90% confidence as default detail
          model_info: { name: model, type: 'ARIMA_PLUS' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: simple percentile-based distribution ----------
        try {
          const rows = await queryBQML(
            dataset,
            `WITH monthly AS (
               SELECT
                 FORMAT_DATE('%Y-%m', data_base_report) AS mes,
                 ${aggExpr} AS valor
               FROM \`${dataset}.contratos\`
               WHERE 1=1 ${buildAndClause(ctx, { dateMode: 'none' })}
               GROUP BY mes
             ),
             stats AS (
               SELECT
                 AVG(valor) AS media,
                 STDDEV(valor) AS desvio,
                 APPROX_QUANTILES(valor, 100)[OFFSET(50)] AS p50,
                 APPROX_QUANTILES(valor, 100)[OFFSET(75)] AS p75,
                 APPROX_QUANTILES(valor, 100)[OFFSET(90)] AS p90,
                 APPROX_QUANTILES(valor, 100)[OFFSET(95)] AS p95,
                 APPROX_QUANTILES(valor, 100)[OFFSET(99)] AS p99
               FROM monthly
             )
             SELECT * FROM stats`,
          );

          const stats = rows[0] ?? {};
          return {
            success: true,
            method: 'PERCENTILE_FALLBACK',
            metric: col,
            horizonte: horizon,
            distribution: {
              expected_loss: Number(stats.media ?? 0),
              p50: Number(stats.p50 ?? 0),
              p75: Number(stats.p75 ?? 0),
              p90: Number(stats.p90 ?? 0),
              var_95: Number(stats.p95 ?? 0),
              var_99: Number(stats.p99 ?? 0),
              stddev: Number(stats.desvio ?? 0),
            },
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
