import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeColumn, safeWhereClause } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { truncateResult } from '@/features/ai-agents/lib/truncate-result';

export function createDetectAnomaliesTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Detecta anomalias em séries temporais usando BigQuery ML ARIMA_PLUS + ML.DETECT_ANOMALIES. Fallback para z-score/IQR se BQML não disponível. Use para "há anomalias nos dados?" ou "algum mês fora do padrão?".',
    inputSchema: z.object({
      metric: z.string().describe('Coluna numérica para analisar. Valores válidos: saldo_devedor, valor_atraso, ltv, pdd_liquid, pricing, dias_atraso, etc.'),
      aggregation: z.enum(['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT']).default('SUM').describe('Tipo de agregação mensal. Use COUNT_DISTINCT para contar valores únicos.'),
      anomalyThreshold: z.number().default(0.05).describe('Probabilidade de anomalia (0-1). Menor = menos anomalias detectadas.'),
      whereClause: z.string().optional().describe('Filtro adicional (sem WHERE).'),
    }),
    execute: async ({ metric, aggregation, anomalyThreshold, whereClause }) => {
      const col = safeColumn(metric);
      const rawAgg = aggregation || 'SUM';
      const aggExpr = rawAgg === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${col})` : `${rawAgg}(${col})`;
      const ctxWhere = buildAndClause(ctx, { dateMode: 'none' });
      const sanitizedWhere = whereClause ? safeWhereClause(whereClause) : '';
      const where = `${ctxWhere}${sanitizedWhere ? ` AND ${sanitizedWhere}` : ''}`;
      const modelName = `arima_${col}_${rawAgg.toLowerCase()}`;
      const model = sessionModelRef(dataset, modelName, ctx.sessionId);

      // ---------- Try BQML ML.DETECT_ANOMALIES ----------
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
             clean_spikes_and_dips = FALSE,
             adjust_step_changes = FALSE
           ) AS
           SELECT
             DATE_TRUNC(data_base_report, MONTH) AS mes,
             ${aggExpr} AS valor
           FROM \`${dataset}.contratos\`
           WHERE 1=1 ${where}
           GROUP BY mes
           ORDER BY mes`,
        );

        const anomalies = await queryBQML(
          dataset,
          `SELECT *
           FROM ML.DETECT_ANOMALIES(MODEL ${model},
             STRUCT(${anomalyThreshold} AS anomaly_prob_threshold))
           ORDER BY mes`,
        );

        const anomalyCount = anomalies.filter(
          (r) => r.is_anomaly === true,
        ).length;

        void dropModel(dataset, model).catch(() => {});

        const truncatedAll = truncateResult(anomalies, 200);

        return {
          success: true,
          method: 'BQML_ARIMA_PLUS',
          metric: col,
          aggregation: rawAgg,
          anomaly_threshold: anomalyThreshold,
          anomalyCount,
          totalPoints: anomalies.length,
          anomalies: anomalies.filter((r) => r.is_anomaly === true),
          all_points: truncatedAll.data,
          all_points_truncated: truncatedAll.truncated,
        };
      } catch (bqmlError) {
        // ---------- Fallback: z-score + IQR ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const [rows] = await bq.query({
            query: `
              WITH monthly AS (
                SELECT
                  FORMAT_DATE('%Y-%m', data_base_report) AS mes,
                  ${aggExpr} AS valor
                FROM \`${dataset}.contratos\`
                WHERE 1=1 ${where}
                GROUP BY mes
                ORDER BY mes
              ),
              stats AS (
                SELECT
                  AVG(valor) AS media,
                  STDDEV(valor) AS desvio,
                  APPROX_QUANTILES(valor, 4)[OFFSET(1)] AS q1,
                  APPROX_QUANTILES(valor, 4)[OFFSET(3)] AS q3
                FROM monthly
              )
              SELECT
                m.mes, m.valor, s.media, s.desvio,
                SAFE_DIVIDE(m.valor - s.media, NULLIF(s.desvio, 0)) AS z_score,
                CASE
                  WHEN m.valor < s.q1 - 1.5 * (s.q3 - s.q1) OR m.valor > s.q3 + 1.5 * (s.q3 - s.q1)
                  THEN true ELSE false
                END AS iqr_outlier
              FROM monthly m
              CROSS JOIN stats s
              ORDER BY m.mes`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          const anomalies = rows.filter((r: Record<string, unknown>) => Math.abs(Number(r.z_score)) > 2 || r.iqr_outlier);

          const truncatedAll = truncateResult(rows, 200);

          return {
            success: true,
            method: 'ZSCORE_IQR_FALLBACK',
            metric: col,
            aggregation: rawAgg,
            totalPoints: rows.length,
            anomalyCount: anomalies.length,
            anomalies,
            all_points: truncatedAll.data,
            all_points_truncated: truncatedAll.truncated,
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
