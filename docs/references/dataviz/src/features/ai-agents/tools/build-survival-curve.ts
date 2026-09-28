import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeColumn } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

export function createBuildSurvivalCurveTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Constrói curva de sobrevivência usando BigQuery ML (BOOSTED_TREE_CLASSIFIER). Prediz P(default) em função do tempo desde originação e features do contrato. Fallback para curva empírica por safra.',
    inputSchema: z.object({
      threshold: z.number().default(90).describe('Dias de atraso para considerar default.'),
      maxMeses: z.number().int().default(36).describe('Horizonte máximo em meses.'),
      segmentBy: z.string().optional().describe('Coluna para segmentar curvas (ex: rating_liquid, faixa_ltv).'),
    }),
    execute: async ({ threshold, maxMeses: maxMonths, segmentBy }) => {
      const segment = segmentBy ? safeColumn(segmentBy) : null;
      const model = sessionModelRef(dataset, 'survival_default', ctx.sessionId);

      // ---------- Try BQML BOOSTED_TREE_CLASSIFIER ----------
      try {
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${model}
           OPTIONS(
             model_type = 'BOOSTED_TREE_CLASSIFIER',
             input_label_cols = ['defaulted'],
             num_parallel_tree = 8,
             max_iterations = 50,
             early_stop = TRUE,
             data_split_method = 'AUTO_SPLIT'
           ) AS
           SELECT
             DATE_DIFF(data_base_report, DATE(data_contrato), MONTH) AS meses_desde_originacao,
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
             CASE WHEN dias_atraso > ${threshold} THEN 1 ELSE 0 END AS defaulted
           FROM \`${dataset}.contratos\`
           WHERE data_contrato IS NOT NULL
             AND data_base_report >= DATE_SUB((SELECT MAX(data_base_report) FROM \`${dataset}.contratos\`), INTERVAL 24 MONTH) ${buildAndClause(ctx, { dateMode: 'none' })}`,
        );

        // Build prediction grid: for each month 1..maxMeses, predict P(default)
        const segmentSelect = segment ? `, s.${segment}` : '';
        const segmentGroup = segment ? `, s.${segment}` : '';

        let numericRatingExpr: string;
        if (segment === 'rating_liquid') {
          numericRatingExpr = `CASE
                 WHEN s.${segment} = 'A' THEN 1
                 WHEN s.${segment} = 'B' THEN 2
                 WHEN s.${segment} = 'C' THEN 3
                 WHEN s.${segment} = 'D' THEN 4
                 WHEN s.${segment} = 'E' THEN 5
                 WHEN s.${segment} = 'F' THEN 6
                 WHEN s.${segment} = 'G' THEN 7
                 WHEN s.${segment} = 'H' THEN 8
                 ELSE 5
               END AS rating_numerico`;
        } else {
          numericRatingExpr = `s.rating_numerico`;
        }

        const gridQuery = segment
          ? `SELECT
               meses_desde_originacao${segmentSelect},
               s.avg_ltv AS ltv,
               s.avg_taxa_juros AS taxa_juros,
               ${numericRatingExpr}
             FROM UNNEST(GENERATE_ARRAY(1, ${maxMonths})) AS meses_desde_originacao
             CROSS JOIN (
               SELECT
                 ${segment},
                 avg_ltv,
                 avg_taxa_juros,
                 DENSE_RANK() OVER (ORDER BY ${segment}) AS rating_numerico
               FROM (
                 SELECT
                   ${segment},
                   AVG(COALESCE(ltv, 0)) AS avg_ltv,
                   AVG(COALESCE(taxa_juros, 0)) AS avg_taxa_juros
                 FROM \`${dataset}.contratos\`
                 WHERE data_base_report = (SELECT MAX(data_base_report) FROM \`${dataset}.contratos\`)
                   AND ${segment} IS NOT NULL ${buildAndClause(ctx, { dateMode: 'none' })}
                 GROUP BY ${segment}
               )
             ) s
             GROUP BY meses_desde_originacao${segmentGroup}, s.avg_ltv, s.avg_taxa_juros, s.rating_numerico`
          : `SELECT
               meses_desde_originacao,
               c.ltv, c.taxa_juros,
               3 AS rating_numerico
             FROM UNNEST(GENERATE_ARRAY(1, ${maxMonths})) AS meses_desde_originacao
             CROSS JOIN (
               SELECT AVG(COALESCE(ltv, 0)) AS ltv, AVG(COALESCE(taxa_juros, 0)) AS taxa_juros
               FROM \`${dataset}.contratos\`
               WHERE data_base_report = (SELECT MAX(data_base_report) FROM \`${dataset}.contratos\`) ${buildAndClause(ctx, { dateMode: 'none' })}
             ) c`;

        const predictions = await queryBQML(
          dataset,
          `SELECT
             p.meses_desde_originacao,
             ${segment ? `p.${segment},` : ''}
             p.predicted_defaulted_probs
           FROM ML.PREDICT(MODEL ${model}, (${gridQuery})) p
           ORDER BY ${segment ? `p.${segment},` : ''} p.meses_desde_originacao`,
        );

        // Transform to survival curve
        const survivalCurve = predictions.map((row) => {
          const probs = row.predicted_defaulted_probs as Array<{ label: number; prob: number }> | undefined;
          const pDefault = probs?.find((p) => p.label === 1)?.prob ?? 0;
          return {
            meses_desde_originacao: row.meses_desde_originacao,
            ...(segment ? { [segment]: row[segment] } : {}),
            prob_default: Math.round(pDefault * 10000) / 10000,
            prob_sobrevivencia: Math.round((1 - pDefault) * 10000) / 10000,
          };
        });

        return {
          success: true,
          method: 'BQML_BOOSTED_TREE',
          threshold,
          maxMeses: maxMonths,
          segmentBy: segment,
          survivalCurve,
          model_info: { name: model, type: 'BOOSTED_TREE_CLASSIFIER' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: curva empírica por safra ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const [rows] = await bq.query({
            query: `
              WITH cohort AS (
                SELECT
                  FORMAT_DATE('%Y-%m', DATE(data_contrato)) AS safra,
                  DATE_DIFF(data_base_report, DATE(data_contrato), MONTH) AS meses,
                  ${segment ? `${segment},` : ''}
                  COUNT(DISTINCT id_contrato) AS total,
                  COUNTIF(dias_atraso > ${threshold}) AS defaults
                FROM \`${dataset}.contratos\`
                WHERE data_contrato IS NOT NULL ${buildAndClause(ctx, { dateMode: 'none' })}
                GROUP BY safra, meses${segment ? `, ${segment}` : ''}
              )
              SELECT
                meses AS meses_desde_originacao,
                ${segment ? `${segment},` : ''}
                SUM(total) AS total_contratos,
                SUM(defaults) AS total_defaults,
                SAFE_DIVIDE(SUM(defaults), SUM(total)) AS prob_default,
                1 - SAFE_DIVIDE(SUM(defaults), SUM(total)) AS prob_sobrevivencia
              FROM cohort
              WHERE meses BETWEEN 1 AND ${maxMonths}
              GROUP BY meses${segment ? `, ${segment}` : ''}
              ORDER BY ${segment ? `${segment},` : ''} meses`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          return {
            success: true,
            method: 'EMPIRICAL_FALLBACK',
            threshold,
            maxMeses: maxMonths,
            segmentBy: segment,
            survivalCurve: rows,
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
