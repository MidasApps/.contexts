import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeDate } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { LGD_EXPR } from './lgd-utils';

export function createCalculatePdLgdTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Calcula PD (Probability of Default) e LGD (Loss Given Default) por rating. Usa BigQuery ML LOGISTIC_REG para PD modelada + PD empírica. Fallback para PD empírica se BQML não disponível.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
    }),
    execute: async ({ dataBase }) => {
      const sanitizedDate = safeDate(dataBase);
      const model = sessionModelRef(dataset, 'pd_logistic', ctx.sessionId);

      // ---------- Always get empirical PD/LGD ----------
      const bq = getBigQueryClient();
      const { datasetId, projectId } = parseDatasetRef(dataset);
      let empiricalRows: Record<string, unknown>[];

      try {
        const [rows] = await bq.query({
          query: `
            SELECT
              rating_liquid,
              COUNT(DISTINCT id_contrato) AS total_contratos,
              COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END) AS defaults,
              SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100 AS pd_pct,
              AVG(CASE WHEN dias_atraso > 90 THEN ${LGD_EXPR} ELSE NULL END) * 100 AS lgd_pct,
              SUM(saldo_devedor) AS ead_total
            FROM \`${dataset}.contratos\`
            WHERE data_base_report = '${sanitizedDate}' ${buildAndClause(ctx, { dateMode: 'none' })}
            GROUP BY rating_liquid
            ORDER BY rating_liquid`,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        empiricalRows = rows as Record<string, unknown>[];
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }

      const totalEclEmpirical = empiricalRows.reduce((s: number, r) => {
        const pd = Number(r.pd_pct ?? 0) / 100;
        const lgd = Number(r.lgd_pct ?? 0) / 100;
        const ead = Number(r.ead_total ?? 0);
        return s + pd * lgd * ead;
      }, 0);

      // ---------- Try BQML LOGISTIC_REG for model-based PD ----------
      try {
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${model}
           OPTIONS(
             model_type = 'LOGISTIC_REG',
             input_label_cols = ['defaulted'],
             auto_class_weights = TRUE,
             max_iterations = 20,
             data_split_method = 'AUTO_SPLIT'
           ) AS
           SELECT
             COALESCE(ltv, 0) AS ltv,
             COALESCE(taxa_juros, 0) AS taxa_juros,
             CASE
               WHEN rating_liquid = 'A' THEN 1
               WHEN rating_liquid = 'B' THEN 2
               WHEN rating_liquid = 'C' THEN 3
               WHEN rating_liquid = 'D' THEN 4
               WHEN rating_liquid = 'E' THEN 5
               WHEN rating_liquid = 'F' THEN 6
               WHEN rating_liquid = 'G' THEN 7
               WHEN rating_liquid = 'H' THEN 8
               ELSE 5
             END AS rating_numerico,
             DATE_DIFF(data_base_report, DATE(data_contrato), MONTH) AS prazo_decorrido,
             CASE WHEN dias_atraso > 90 THEN 1 ELSE 0 END AS defaulted
           FROM \`${dataset}.contratos\`
           WHERE data_base_report = (SELECT MAX(data_base_report) FROM \`${dataset}.contratos\`) AND data_contrato IS NOT NULL ${buildAndClause(ctx, { dateMode: 'none' })}`,
        );

        // Get model-based PD per rating
        const modelPd = await queryBQML(
          dataset,
          `SELECT
             c.rating_liquid,
             AVG(CASE
               WHEN prob.label = 1 THEN prob.prob
               ELSE NULL
             END) * 100 AS pd_modelo_pct,
             COUNT(*) AS n
           FROM ML.PREDICT(MODEL ${model}, (
             SELECT
               id_contrato, rating_liquid,
               COALESCE(ltv, 0) AS ltv,
               COALESCE(taxa_juros, 0) AS taxa_juros,
               CASE
                 WHEN rating_liquid = 'A' THEN 1
                 WHEN rating_liquid = 'B' THEN 2
                 WHEN rating_liquid = 'C' THEN 3
                 WHEN rating_liquid = 'D' THEN 4
                 WHEN rating_liquid = 'E' THEN 5
                 WHEN rating_liquid = 'F' THEN 6
                 WHEN rating_liquid = 'G' THEN 7
                 WHEN rating_liquid = 'H' THEN 8
                 ELSE 5
               END AS rating_numerico,
               DATE_DIFF(data_base_report, DATE(data_contrato), MONTH) AS prazo_decorrido
             FROM \`${dataset}.contratos\`
             WHERE data_base_report = '${sanitizedDate}'
               AND data_contrato IS NOT NULL
               ${buildAndClause(ctx, { dateMode: 'none' })}
           )) pred,
           UNNEST(pred.predicted_defaulted_probs) prob
           JOIN \`${dataset}.contratos\` c
             ON c.id_contrato = pred.id_contrato
             AND c.data_base_report = '${sanitizedDate}'
           WHERE prob.label = 1
           GROUP BY c.rating_liquid
           ORDER BY c.rating_liquid`,
        );

        // Merge empirical + model PD
        const modelPdMap = new Map(
          modelPd.map((r) => [String(r.rating_liquid), Number(r.pd_modelo_pct ?? 0)]),
        );

        const mergedByRating = empiricalRows.map((r) => ({
          ...r,
          pd_modelo_pct: modelPdMap.get(String(r.rating_liquid)) ?? null,
        }));

        // Model-based ECL
        const totalEclModel = mergedByRating.reduce((s: number, r: Record<string, unknown>) => {
          const pd = (Number(r.pd_modelo_pct ?? r.pd_pct ?? 0)) / 100;
          const lgd = Number(r.lgd_pct ?? 0) / 100;
          const ead = Number(r.ead_total ?? 0);
          return s + pd * lgd * ead;
        }, 0);

        return {
          success: true,
          method: 'BQML_LOGISTIC_REG',
          dataBase,
          byRating: mergedByRating,
          eclEmpirico: totalEclEmpirical,
          eclModelo: totalEclModel,
          model_info: { name: model, type: 'LOGISTIC_REG' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: only empirical ----------
        return {
          success: true,
          method: 'EMPIRICAL_ONLY',
          dataBase,
          byRating: empiricalRows,
          eclEstimado: totalEclEmpirical,
          bqml_error: formatToolError(bqmlError),
        };
      }
    },
  });
}
