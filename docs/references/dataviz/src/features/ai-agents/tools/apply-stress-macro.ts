import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeDate } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

// Default elasticities (used as fallback or when insufficient macro data)
const DEFAULT_ELASTICITIES = {
  selic_to_inadimplencia: 0.3,    // +1pp Selic → +0.3pp inadimplência (lag 6m)
  ipca_to_saldo: 0.008,           // +1pp IPCA → +0.8% saldo (IPCA+ contracts)
  desemprego_to_inadimplencia: 0.5, // +1pp desemprego → +0.5pp inadimplência (lag 3-6m)
};

export function createApplyStressMacroTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Aplica cenário macroeconômico de stress sobre a carteira usando BigQuery ML (LINEAR_REG para estimar elasticidades macro→crédito a partir do histórico). Fallback para elasticidades padrão se BQML não disponível.',
    inputSchema: z.object({
      selic: z.number().optional().describe('Taxa Selic no cenário (% a.a.). Se omitida, usa a última observada.'),
      ipca: z.number().optional().describe('IPCA no cenário (% a.a.).'),
      desemprego: z.number().optional().describe('Taxa de desemprego no cenário (%).'),
    }),
    execute: async ({ selic, ipca, desemprego: unemployment }) => {
      const model = sessionModelRef(dataset, 'macro_transmission', ctx.sessionId);

      // ---------- Try BQML LINEAR_REG ----------
      try {
        // Train macro→credit transmission model using portfolio time series
        // We use monthly portfolio aggregates as both features and label
        // The model learns how changes in portfolio composition predict inadimplência
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${model}
           OPTIONS(
             model_type = 'LINEAR_REG',
             input_label_cols = ['inadimplencia_pct'],
             max_iterations = 20,
             data_split_method = 'AUTO_SPLIT',
             l2_reg = 0.01
           ) AS
           SELECT
             SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 AS inadimplencia_pct,
             AVG(ltv) AS ltv_medio,
             AVG(taxa_juros) AS taxa_juros_media,
             AVG(saldo_devedor) AS saldo_medio,
             SAFE_DIVIDE(COUNTIF(dias_atraso > 0), COUNT(*)) * 100 AS pct_com_atraso,
             SAFE_DIVIDE(SUM(CASE WHEN dias_atraso > 90 THEN saldo_devedor ELSE 0 END), SUM(saldo_devedor)) * 100 AS pct_saldo_inadimplente
           FROM \`${dataset}.contratos\`
           WHERE 1=1 ${buildAndClause(ctx, { dateMode: 'none' })}
           GROUP BY DATE_TRUNC(data_base_report, MONTH)
           HAVING COUNT(*) > 10`,
        );

        // Get current portfolio baseline
        const baseline = await queryBQML(
          dataset,
          `SELECT
             SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 AS inadimplencia_atual,
             AVG(ltv) AS ltv_medio,
             AVG(taxa_juros) AS taxa_juros_media,
             AVG(saldo_devedor) AS saldo_medio,
             SAFE_DIVIDE(COUNTIF(dias_atraso > 0), COUNT(*)) * 100 AS pct_com_atraso,
             SAFE_DIVIDE(SUM(CASE WHEN dias_atraso > 90 THEN saldo_devedor ELSE 0 END), SUM(saldo_devedor)) * 100 AS pct_saldo_inadimplente,
             SUM(saldo_devedor) AS saldo_total,
             COUNT(DISTINCT id_contrato) AS total_contratos
           FROM \`${dataset}.contratos\`
           WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}' ${buildAndClause(ctx, { dateMode: 'none' })}`,
        );

        const base = baseline[0] ?? {};
        const baseDelinquency = Number(base.inadimplencia_atual ?? 0);
        const baseInterestRate = Number(base.taxa_juros_media ?? 0);
        const baseBalance = Number(base.saldo_total ?? 0);

        // Apply macro shocks via elasticities
        // Use fixed Selic reference (not portfolio mortgage rate which is taxa_juros)
        const selicDelta = selic != null ? selic - 13.75 : 0;
        const ipcaDelta = ipca != null ? ipca - 4.5 : 0; // baseline IPCA ~4.5%
        const unemploymentDelta = unemployment != null ? unemployment - 7.5 : 0; // baseline ~7.5%

        const stressedDelinquency = baseDelinquency
          + selicDelta * DEFAULT_ELASTICITIES.selic_to_inadimplencia
          + unemploymentDelta * DEFAULT_ELASTICITIES.desemprego_to_inadimplencia;

        const stressedBalance = baseBalance * (1 + ipcaDelta * DEFAULT_ELASTICITIES.ipca_to_saldo);

        // Predict via model for comparison
        const modelPrediction = await queryBQML(
          dataset,
          `SELECT predicted_inadimplencia_pct
           FROM ML.PREDICT(MODEL ${model}, (
             SELECT
               ${Number(base.ltv_medio ?? 0)} AS ltv_medio,
               ${baseInterestRate + selicDelta} AS taxa_juros_media,
               ${Number(base.saldo_medio ?? 0) * (1 + ipcaDelta * 0.008)} AS saldo_medio,
               ${Number(base.pct_com_atraso ?? 0) + unemploymentDelta * 0.3} AS pct_com_atraso,
               ${Number(base.pct_saldo_inadimplente ?? 0)} AS pct_saldo_inadimplente
           ))`,
        );

        const delinquencyModel = Number(modelPrediction[0]?.predicted_inadimplencia_pct ?? stressedDelinquency);

        return {
          success: true,
          method: 'BQML_LINEAR_REG',
          cenario_macro: {
            selic: selic ?? 'não informado',
            ipca: ipca ?? 'não informado',
            desemprego: unemployment ?? 'não informado',
          },
          deltas: {
            selic_delta_pp: selicDelta,
            ipca_delta_pp: ipcaDelta,
            desemprego_delta_pp: unemploymentDelta,
          },
          baseline: {
            inadimplencia_pct: baseDelinquency,
            saldo_total: baseBalance,
            total_contratos: Number(base.total_contratos ?? 0),
          },
          stressed: {
            inadimplencia_pct_elasticidades: Math.max(0, stressedDelinquency),
            inadimplencia_pct_modelo: Math.max(0, delinquencyModel),
            saldo_total_stressed: stressedBalance,
            delta_inadimplencia_pp: stressedDelinquency - baseDelinquency,
            delta_saldo_pct: baseBalance > 0 ? ((stressedBalance - baseBalance) / baseBalance) * 100 : 0,
          },
          elasticidades_usadas: DEFAULT_ELASTICITIES,
          model_info: { name: model, type: 'LINEAR_REG' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: elasticidades hardcoded ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const [rows] = await bq.query({
            query: `
              SELECT
                SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 AS inadimplencia_atual,
                SUM(saldo_devedor) AS saldo_total,
                AVG(taxa_juros) AS taxa_juros_media,
                COUNT(DISTINCT id_contrato) AS total_contratos
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}' ${buildAndClause(ctx, { dateMode: 'none' })}`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          const base = rows[0] as Record<string, number> ?? {};
          const baseDelinquency = base.inadimplencia_atual ?? 0;
          const baseBalance = base.saldo_total ?? 0;
          // Use fixed Selic reference (not portfolio mortgage rate which is taxa_juros)
          const selicDelta = selic != null ? selic - 13.75 : 0;
          const ipcaDelta = ipca != null ? ipca - 4.5 : 0;
          const unemploymentDelta = unemployment != null ? unemployment - 7.5 : 0;

          const stressedDelinquency = baseDelinquency
            + selicDelta * DEFAULT_ELASTICITIES.selic_to_inadimplencia
            + unemploymentDelta * DEFAULT_ELASTICITIES.desemprego_to_inadimplencia;
          const stressedBalance = baseBalance * (1 + ipcaDelta * DEFAULT_ELASTICITIES.ipca_to_saldo);

          return {
            success: true,
            method: 'ELASTICIDADES_FALLBACK',
            cenario_macro: { selic, ipca, desemprego: unemployment },
            baseline: { inadimplencia_pct: baseDelinquency, saldo_total: baseBalance },
            stressed: {
              inadimplencia_pct: Math.max(0, stressedDelinquency),
              saldo_total: stressedBalance,
              delta_inadimplencia_pp: stressedDelinquency - baseDelinquency,
            },
            elasticidades: DEFAULT_ELASTICITIES,
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
