import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeDate } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import { LGD_COALESCE_EXPR } from './lgd-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

const STRESS_MULTIPLIERS: Record<string, { pd: number; lgd: number; label: string }> = {
  base:         { pd: 1.0,  lgd: 1.0,  label: 'Base' },
  conservador:  { pd: 1.3,  lgd: 1.1,  label: 'Conservador' },
  adverso:      { pd: 1.8,  lgd: 1.3,  label: 'Adverso' },
  severo:       { pd: 2.5,  lgd: 1.5,  label: 'Severo' },
};

export function createCalculateStressedEclTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Calcula ECL (Expected Credit Loss) sob cenários de stress usando BigQuery ML (LOGISTIC_REG para PD). Aplica multiplicadores de stress sobre PD/LGD estimados pelo modelo. Fallback para PD empírica.',
    inputSchema: z.object({
      cenario: z.enum(['base', 'conservador', 'adverso', 'severo']).describe('Cenário de stress.'),
      horizonte: z.enum(['12m', 'lifetime']).default('12m').describe('Horizonte de ECL (informativo — incluído no resultado para referência).'),
    }),
    execute: async ({ cenario: scenario, horizonte: horizon }) => {
      const stress = STRESS_MULTIPLIERS[scenario];
      const model = sessionModelRef(dataset, 'pd_logistic', ctx.sessionId);

      // ---------- Try BQML LOGISTIC_REG ----------
      try {
        // Train PD model
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
           WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}' AND data_contrato IS NOT NULL ${buildAndClause(ctx, { dateMode: 'none' })}`,
        );

        // Predict PD for current portfolio
        // Qualify column refs in LGD expr to avoid ambiguity with pred alias
        const lgdQualified = LGD_COALESCE_EXPR.replace(/valor_imovel/g, 'p.valor_imovel').replace(/saldo_devedor/g, 'p.saldo_devedor');
        const predictions = await queryBQML(
          dataset,
          `SELECT
             p.id_contrato,
             p.rating_liquid,
             p.saldo_devedor,
             ${lgdQualified} AS lgd,
             pred.predicted_defaulted_probs
           FROM ML.PREDICT(MODEL ${model}, (
             SELECT
               id_contrato,
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
             WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
               AND data_contrato IS NOT NULL ${buildAndClause(ctx, { dateMode: 'none' })}
           )) pred
           JOIN \`${dataset}.contratos\` p
             ON pred.id_contrato = p.id_contrato
             AND p.data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
           WHERE 1=1 ${buildAndClause(ctx, { dateMode: 'none' })}`,
        );

        // Calculate ECL per rating
        const byRating: Record<string, { count: number; ead: number; pd_avg: number; lgd_avg: number; ecl: number }> = {};
        let totalEcl = 0;
        let totalEad = 0;

        for (const row of predictions) {
          const rating = String(row.rating_liquid ?? 'N/A');
          const probs = row.predicted_defaulted_probs as Array<{ label: number; prob: number }> | undefined;
          const pdBase = probs?.find((p) => p.label === 1)?.prob ?? 0;
          const ead = Number(row.saldo_devedor ?? 0);
          const lgdBase = Number(row.lgd ?? 0.45);

          const pdStressed = Math.min(pdBase * stress.pd, 1);
          const lgdStressed = Math.min(lgdBase * stress.lgd, 1);
          const ecl = pdStressed * lgdStressed * ead;

          if (!byRating[rating]) byRating[rating] = { count: 0, ead: 0, pd_avg: 0, lgd_avg: 0, ecl: 0 };
          byRating[rating].count++;
          byRating[rating].ead += ead;
          byRating[rating].pd_avg += pdStressed;
          byRating[rating].lgd_avg += lgdStressed;
          byRating[rating].ecl += ecl;
          totalEcl += ecl;
          totalEad += ead;
        }

        // Average PD/LGD per rating
        const ratingResults = Object.entries(byRating).map(([rating, stats]) => ({
          rating,
          count: stats.count,
          ead: stats.ead,
          pd_avg_pct: (stats.pd_avg / stats.count) * 100,
          lgd_avg_pct: (stats.lgd_avg / stats.count) * 100,
          ecl: stats.ecl,
        })).sort((a, b) => a.rating.localeCompare(b.rating));

        return {
          success: true,
          method: 'BQML_LOGISTIC_REG',
          cenario: stress.label,
          horizonte: horizon,
          stress_multipliers: { pd: stress.pd, lgd: stress.lgd },
          totalEcl,
          totalEad,
          ecl_pct: totalEad > 0 ? (totalEcl / totalEad) * 100 : 0,
          byRating: ratingResults,
          total_contratos: predictions.length,
          model_info: { name: model, type: 'LOGISTIC_REG' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: PD empírica ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const [rows] = await bq.query({
            query: `
              SELECT
                rating_liquid,
                COUNT(DISTINCT id_contrato) AS total_contratos,
                COUNTIF(dias_atraso > 90) AS defaults,
                SAFE_DIVIDE(COUNTIF(dias_atraso > 90), COUNT(DISTINCT id_contrato)) AS pd_base,
                AVG(CASE WHEN dias_atraso > 90 THEN SAFE_DIVIDE(valor_atraso, saldo_devedor) ELSE 0.25 END) AS lgd_base,
                SUM(saldo_devedor) AS ead
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}' ${buildAndClause(ctx, { dateMode: 'none' })}
              GROUP BY rating_liquid
              ORDER BY rating_liquid`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          let totalEcl = 0;
          let totalEad = 0;
          const byRating = rows.map((r: Record<string, unknown>) => {
            const pdBase = Number(r.pd_base ?? 0);
            const lgdBase = Number(r.lgd_base ?? 0.25);
            const ead = Number(r.ead ?? 0);
            const pdStressed = Math.min(pdBase * stress.pd, 1);
            const lgdStressed = Math.min(lgdBase * stress.lgd, 1);
            const ecl = pdStressed * lgdStressed * ead;
            totalEcl += ecl;
            totalEad += ead;
            return {
              rating: r.rating_liquid,
              count: Number(r.total_contratos),
              ead,
              pd_base_pct: pdBase * 100,
              pd_stressed_pct: pdStressed * 100,
              lgd_base_pct: lgdBase * 100,
              lgd_stressed_pct: lgdStressed * 100,
              ecl,
            };
          });

          return {
            success: true,
            method: 'EMPIRICAL_PD_FALLBACK',
            cenario: stress.label,
            horizonte: horizon,
            stress_multipliers: { pd: stress.pd, lgd: stress.lgd },
            totalEcl,
            totalEad,
            ecl_pct: totalEad > 0 ? (totalEcl / totalEad) * 100 : 0,
            byRating,
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
