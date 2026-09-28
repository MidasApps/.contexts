import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeColumn, safeWhereClause } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

function addMonths(yearMonth: string, months: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}

export function createForecastTimeseriesTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Projeta uma métrica no tempo usando BigQuery ML ARIMA_PLUS (sazonalidade, tendência, intervalos de confiança). Fallback para regressão linear se BQML não disponível. Use para "qual a projeção de inadimplência?" ou "tendência do saldo devedor".',
    inputSchema: z.object({
      metric: z.string().describe('Coluna numérica para projetar. Valores válidos: saldo_devedor, valor_atraso, ltv, pdd_liquid, pricing, etc. Para contar contratos, use id_contrato com aggregation COUNT_DISTINCT.'),
      aggregation: z.enum(['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT']).default('SUM').describe('Agregação mensal. Use COUNT_DISTINCT para contar valores únicos (ex: total de contratos distintos).'),
      horizonte: z.number().int().default(6).describe('Meses a projetar à frente.'),
      confidenceLevel: z.number().min(0.01).max(0.99).default(0.95).describe('Nível de confiança para intervalos (0.01-0.99).'),
      whereClause: z.string().optional().describe('Filtro adicional (sem WHERE).'),
    }),
    execute: async ({ metric, aggregation, horizonte: horizon, confidenceLevel, whereClause }) => {
      const col = safeColumn(metric);
      const rawAgg = aggregation || 'SUM';
      const aggExpr = rawAgg === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${col})` : `${rawAgg}(${col})`;
      const agg = rawAgg; // keep for naming
      const sanitizedWhere = whereClause ? safeWhereClause(whereClause) : '';
      const where = sanitizedWhere ? `AND ${sanitizedWhere}` : '';
      const model = sessionModelRef(dataset, `arima_${col}_${agg.toLowerCase()}`, ctx.sessionId);

      console.log('[forecast-timeseries] metric=%s, aggregation=%s, aggExpr=%s, model=%s, dataset=%s', col, rawAgg, aggExpr, model, dataset);

      // ---------- Try BQML ARIMA_PLUS ----------
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
             clean_spikes_and_dips = TRUE,
             adjust_step_changes = TRUE
           ) AS
           SELECT
             DATE_TRUNC(data_base_report, MONTH) AS mes,
             ${aggExpr} AS valor
           FROM \`${dataset}.contratos\`
           WHERE 1=1 ${where} ${buildAndClause(ctx, { dateMode: 'none' })}
           GROUP BY mes
           ORDER BY mes`,
        );

        const [history, forecast] = await Promise.all([
          queryBQML(
            dataset,
            `SELECT
               DATE_TRUNC(data_base_report, MONTH) AS mes,
               ${aggExpr} AS valor
             FROM \`${dataset}.contratos\`
             WHERE 1=1 ${where} ${buildAndClause(ctx, { dateMode: 'none' })}
             GROUP BY mes
             ORDER BY mes`,
          ),
          queryBQML(
            dataset,
            `SELECT *
             FROM ML.FORECAST(MODEL ${model},
               STRUCT(${horizon} AS horizon, ${confidenceLevel} AS confidence_level))
             ORDER BY forecast_timestamp`,
          ),
        ]);

        return {
          success: true,
          method: 'ARIMA_PLUS',
          warnings: [],
          metric: col,
          aggregation: agg,
          historico: history,
          forecast,
          model_info: {
            name: model,
            type: 'ARIMA_PLUS',
            horizon,
            confidence_level: confidenceLevel,
          },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        console.error('[forecast-timeseries] BQML error:', bqmlError instanceof Error ? bqmlError.message : String(bqmlError));
        // ---------- Fallback: regressão linear ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const [rows] = await bq.query({
            query: `
              WITH monthly_raw AS (
                SELECT
                  FORMAT_DATE('%Y-%m', data_base_report) AS mes,
                  ${aggExpr} AS valor
                FROM \`${dataset}.contratos\`
                WHERE 1=1 ${where} ${buildAndClause(ctx, { dateMode: 'none' })}
                GROUP BY mes
              ),
              monthly AS (
                SELECT
                  mes,
                  DATE_DIFF(PARSE_DATE('%Y-%m', mes), MIN(PARSE_DATE('%Y-%m', mes)) OVER(), MONTH) + 1 AS t,
                  valor
                FROM monthly_raw
              ),
              reg AS (
                SELECT
                  REGR_SLOPE(valor, t) AS slope,
                  REGR_INTERCEPT(valor, t) AS intercept,
                  REGR_R2(valor, t) AS r_squared,
                  MAX(t) AS last_t
                FROM monthly
              )
              SELECT
                m.mes, m.t, m.valor,
                AVG(m.valor) OVER (ORDER BY m.t ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS media_movel_3m,
                r.slope, r.intercept, r.r_squared, r.last_t
              FROM monthly m
              CROSS JOIN reg r
              ORDER BY m.t`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          if (rows.length === 0) {
            return { success: false, error: 'Dados insuficientes para projeção. Nenhuma linha encontrada para o período e filtros selecionados.' };
          }
          const reg = rows[0] as Record<string, number> | undefined;
          const slope = reg?.slope ?? 0;
          const intercept = reg?.intercept ?? 0;
          const lastT = reg?.last_t ?? rows.length;

          // Build forecast with same shape as BQML for consistent downstream handling
          const lastRow = rows[rows.length - 1] as Record<string, unknown> | undefined;
          const lastMonth = lastRow?.mes as string | undefined;
          // Approximate bounds using residual standard error (constant across all forecast steps)
          const residuals = rows.map(r => ((r as Record<string, number>).valor - (intercept + slope * (r as Record<string, number>).t)));
          const rse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(residuals.length - 2, 1));
          const marginOfError = 1.96 * rse * Math.sqrt(1 + 1 / rows.length);
          const forecast = Array.from({ length: horizon }, (_, i) => {
            const futureT = lastT + i + 1;
            const forecastValue = intercept + slope * futureT;
            return {
              forecast_timestamp: lastMonth ? addMonths(lastMonth, i + 1) : `T+${i + 1}`,
              forecast_value: forecastValue,
              prediction_interval_lower_bound: forecastValue - marginOfError,
              prediction_interval_upper_bound: forecastValue + marginOfError,
            };
          });

          return {
            success: true,
            method: 'LINEAR_REGRESSION_FALLBACK',
            warnings: ['BQML ARIMA_PLUS indisponível neste dataset. Usando regressão linear simples — projeção sem sazonalidade, menos precisa para séries com padrões cíclicos.'],
            metric: col,
            aggregation: agg,
            historico: rows,
            forecast,
            regressao: { slope, intercept, r_squared: reg?.r_squared },
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
