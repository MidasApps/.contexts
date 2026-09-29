import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeDateOrMonth } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

export function createCalculateCprCdrTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Calcula CPR (Conditional Prepayment Rate) e CDR (Conditional Default Rate) históricos + projeção via BigQuery ML ARIMA_PLUS. Fallback para histórico sem projeção.',
    inputSchema: z.object({
      startDate: z.string().optional().describe('Data inicial (YYYY-MM). Se omitida, últimos 12 meses.'),
      endDate: z.string().optional().describe('Data final (YYYY-MM).'),
      horizonte: z.number().int().default(6).describe('Meses a projetar à frente.'),
    }),
    execute: async ({ startDate, endDate, horizonte: horizon }) => {
      const bq = getBigQueryClient();
      const { datasetId, projectId } = parseDatasetRef(dataset);
      const toMonth = (d: string) => safeDateOrMonth(d).substring(0, 7);
      const dateFilter = startDate && endDate
        ? `WHERE FORMAT_DATE('%Y-%m', data_base_report) BETWEEN '${toMonth(startDate)}' AND '${toMonth(endDate)}'`
        : 'WHERE data_base_report >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)';

      // ---------- Always get historical CPR/CDR ----------
      let historicalRows: Record<string, unknown>[];
      try {
        const [rows] = await bq.query({
          query: `
            WITH pagamentos_mensal AS (
              SELECT
                FORMAT_DATE('%Y-%m', data_base_report) AS mes,
                DATE_TRUNC(data_base_report, MONTH) AS mes_date,
                SUM(CASE WHEN tipo_recebimento = 'Pagamento antecipado' THEN valor_pago ELSE 0 END) AS prepagamentos
              FROM \`${dataset}.pagamentos\`
              ${dateFilter}
              GROUP BY mes, mes_date
            ),
            contratos_mensal AS (
              SELECT
                mes,
                SUM(saldo_devedor) AS saldo_inicio,
                COUNTIF(dias_atraso > 90 AND (prev_dias_atraso IS NULL OR prev_dias_atraso <= 90)) AS novos_defaults,
                COUNTIF(dias_atraso <= 90) AS contratos_performing
              FROM (
                SELECT
                  FORMAT_DATE('%Y-%m', data_base_report) AS mes,
                  saldo_devedor,
                  dias_atraso,
                  LAG(dias_atraso) OVER (PARTITION BY id_contrato ORDER BY data_base_report) AS prev_dias_atraso
                FROM \`${dataset}.contratos\`
                WHERE data_base_report IN (
                  SELECT MAX(data_base_report)
                  FROM \`${dataset}.contratos\`
                  GROUP BY FORMAT_DATE('%Y-%m', data_base_report)
                ) ${buildAndClause(ctx, { dateMode: 'none' })}
              )
              GROUP BY mes
            )
            SELECT
              p.mes, p.mes_date,
              p.prepagamentos, c.saldo_inicio,
              c.novos_defaults, c.contratos_performing,
              SAFE_DIVIDE(p.prepagamentos, c.saldo_inicio) * 100 AS smm_pct,
              (1 - POWER(1 - LEAST(GREATEST(SAFE_DIVIDE(p.prepagamentos, NULLIF(c.saldo_inicio, 0)), 0), 1), 12)) * 100 AS cpr_anualizado_pct,
              SAFE_DIVIDE(c.novos_defaults, NULLIF(c.contratos_performing + c.novos_defaults, 0)) * 100 AS mdr_pct,
              (1 - POWER(1 - LEAST(GREATEST(SAFE_DIVIDE(c.novos_defaults, NULLIF(c.contratos_performing + c.novos_defaults, 0)), 0), 1), 12)) * 100 AS cdr_anualizado_pct
            FROM pagamentos_mensal p
            LEFT JOIN contratos_mensal c ON p.mes = c.mes
            ORDER BY p.mes`,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        historicalRows = rows as Record<string, unknown>[];
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }

      // ---------- Try BQML ARIMA_PLUS for CPR/CDR forecast ----------
      const cprModel = sessionModelRef(dataset, 'arima_cpr', ctx.sessionId);
      const cdrModel = sessionModelRef(dataset, 'arima_cdr', ctx.sessionId);
      try {

        // Train CPR model
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${cprModel}
           OPTIONS(
             model_type = 'ARIMA_PLUS',
             time_series_timestamp_col = 'mes_date',
             time_series_data_col = 'cpr_value',
             auto_arima = TRUE,
             data_frequency = 'MONTHLY'
           ) AS
           WITH monthly_pag AS (
             SELECT
               DATE_TRUNC(data_base_report, MONTH) AS mes_date,
               SUM(CASE WHEN tipo_recebimento = 'Pagamento antecipado' THEN valor_pago ELSE 0 END) AS prepagamentos
             FROM \`${dataset}.pagamentos\`
             ${dateFilter}
             GROUP BY mes_date
           ),
           monthly_saldo AS (
             SELECT
               DATE_TRUNC(data_base_report, MONTH) AS mes_date,
               SUM(saldo_devedor) AS saldo
             FROM \`${dataset}.contratos\`
             WHERE data_base_report IN (
               SELECT MAX(data_base_report) FROM \`${dataset}.contratos\` GROUP BY FORMAT_DATE('%Y-%m', data_base_report)
             ) ${buildAndClause(ctx, { dateMode: 'none' })}
             GROUP BY mes_date
           )
           SELECT
             p.mes_date,
             (1 - POWER(1 - SAFE_DIVIDE(p.prepagamentos, NULLIF(s.saldo, 0)), 12)) * 100 AS cpr_value
           FROM monthly_pag p
           LEFT JOIN monthly_saldo s ON p.mes_date = s.mes_date
           ORDER BY p.mes_date`,
        );

        // Train CDR model
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${cdrModel}
           OPTIONS(
             model_type = 'ARIMA_PLUS',
             time_series_timestamp_col = 'mes_date',
             time_series_data_col = 'cdr_value',
             auto_arima = TRUE,
             data_frequency = 'MONTHLY'
           ) AS
           WITH lagged AS (
             SELECT
               DATE_TRUNC(data_base_report, MONTH) AS mes_date,
               dias_atraso,
               LAG(dias_atraso) OVER (PARTITION BY id_contrato ORDER BY data_base_report) AS prev_dias_atraso
             FROM \`${dataset}.contratos\`
             WHERE 1=1 ${buildAndClause(ctx, { dateMode: 'none' })}
           ),
           filtered AS (
             SELECT * FROM lagged
             ${dateFilter.replace(/data_base_report/g, 'mes_date')}
           )
           SELECT
             mes_date,
             (1 - POWER(1 - SAFE_DIVIDE(
               COUNTIF(dias_atraso > 90 AND (prev_dias_atraso IS NULL OR prev_dias_atraso <= 90)),
               NULLIF(COUNTIF(prev_dias_atraso IS NULL OR prev_dias_atraso <= 90), 0)
             ), 12)) * 100 AS cdr_value
           FROM filtered
           GROUP BY mes_date
           ORDER BY mes_date`,
        );

        // Forecast both
        const [cprForecast, cdrForecast] = await Promise.all([
          queryBQML(
            dataset,
            `SELECT
               forecast_timestamp, forecast_value AS cpr_projetado,
               prediction_interval_lower_bound AS cpr_lower,
               prediction_interval_upper_bound AS cpr_upper
             FROM ML.FORECAST(MODEL ${cprModel},
               STRUCT(${horizon} AS horizon, 0.90 AS confidence_level))
             ORDER BY forecast_timestamp`,
          ),
          queryBQML(
            dataset,
            `SELECT
               forecast_timestamp, forecast_value AS cdr_projetado,
               prediction_interval_lower_bound AS cdr_lower,
               prediction_interval_upper_bound AS cdr_upper
             FROM ML.FORECAST(MODEL ${cdrModel},
               STRUCT(${horizon} AS horizon, 0.90 AS confidence_level))
             ORDER BY forecast_timestamp`,
          ),
        ]);

        return {
          success: true,
          method: 'BQML_ARIMA_PLUS',
          rowCount: historicalRows.length,
          historico: historicalRows,
          cpr_forecast: cprForecast,
          cdr_forecast: cdrForecast,
          model_info: {
            cpr_model: cprModel,
            cdr_model: cdrModel,
            type: 'ARIMA_PLUS',
            horizonte: horizon,
          },
        };
      } catch (bqmlError) {
        await dropModel(dataset, cprModel);
        await dropModel(dataset, cdrModel);
        // ---------- Fallback: historical only ----------
        return {
          success: true,
          method: 'HISTORICAL_ONLY',
          rowCount: historicalRows.length,
          historico: historicalRows,
          bqml_error: formatToolError(bqmlError),
        };
      }
    },
  });
}
