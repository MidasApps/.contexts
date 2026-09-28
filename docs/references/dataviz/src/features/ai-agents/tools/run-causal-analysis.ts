import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeColumn, safeDate } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { quoteStringLiteral } from '@/shared/lib/bigquery/identifier';
import { buildFilterClause } from './tool-context';

export function createRunCausalAnalysisTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Executa análise causal (Difference-in-Differences) usando BigQuery ML LINEAR_REG com termo de interação. Estima o efeito causal de uma intervenção comparando grupo tratado vs controle antes/depois. Fallback para decompose_variation.',
    inputSchema: z.object({
      metrica: z.string().describe('Métrica de resultado (ex: dias_atraso, saldo_devedor, valor_atraso).'),
      tratamentoColuna: z.string().describe('Coluna que define grupo tratado (ex: nome_empreendimento, rating_liquid).'),
      tratamentoValor: z.string().describe('Valor que identifica o grupo tratado (ex: "Projeto A", "B").'),
      dataCortePre: z.string().describe('Data de corte (YYYY-MM-DD) — antes = pré-tratamento, depois = pós.'),
      aggregation: z.enum(['AVG', 'SUM', 'COUNT']).default('AVG').describe('Agregação da métrica.'),
    }),
    execute: async ({ metrica: metric, tratamentoColuna: treatmentColumn, tratamentoValor: treatmentValue, dataCortePre: preCutoffDate, aggregation }) => {
      const col = safeColumn(metric);
      const treatCol = safeColumn(treatmentColumn);
      const safeCutoff = safeDate(preCutoffDate);
      // Texto livre do modelo: vira literal escapado, nunca código.
      const treatmentLiteral = quoteStringLiteral(treatmentValue);
      const agg = aggregation || 'AVG';
      const model = sessionModelRef(dataset, `did_${col}_${treatCol}`, ctx.sessionId);
      const rangeFilter = (() => { const c = buildFilterClause(ctx, { dateMode: 'range' }); return c ? ` AND ${c}` : ''; })();

      // ---------- Try BQML LINEAR_REG (DiD) ----------
      try {
        // DiD model: y = β0 + β1·treated + β2·post + β3·(treated×post) + ε
        // β3 is the causal effect (DiD estimator)
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${model}
           OPTIONS(
             model_type = 'LINEAR_REG',
             input_label_cols = ['metrica_valor'],
             max_iterations = 20
           ) AS
           SELECT
             ${agg}(${col}) AS metrica_valor,
             CASE WHEN ${treatCol} = ${treatmentLiteral} THEN 1 ELSE 0 END AS treated,
             CASE WHEN data_base_report >= '${safeCutoff}' THEN 1 ELSE 0 END AS post_period,
             CASE
               WHEN ${treatCol} = ${treatmentLiteral} AND data_base_report >= '${safeCutoff}' THEN 1
               ELSE 0
             END AS treated_x_post
           FROM \`${dataset}.contratos\`
           WHERE TRUE${rangeFilter}
           GROUP BY treated, post_period, treated_x_post`,
        );

        // Get model weights (coefficients)
        const weights = await queryBQML(
          dataset,
          `SELECT *
           FROM ML.WEIGHTS(MODEL ${model})
           ORDER BY weight`,
        );

        // Get descriptive stats for both groups pre/post
        const stats = await queryBQML(
          dataset,
          `SELECT
             CASE WHEN ${treatCol} = ${treatmentLiteral} THEN 'Tratado' ELSE 'Controle' END AS grupo,
             CASE WHEN data_base_report >= '${safeCutoff}' THEN 'Pós' ELSE 'Pré' END AS periodo,
             ${agg}(${col}) AS metrica_valor,
             COUNT(DISTINCT id_contrato) AS n_contratos
           FROM \`${dataset}.contratos\`
           WHERE TRUE${rangeFilter}
           GROUP BY 1, 2
           ORDER BY 1, 2`,
        );

        // Extract DiD coefficient
        const didCoeff = weights.find(
          (w) => String(w.processed_input ?? w.category_name ?? '').includes('treated_x_post'),
        );
        const didEffect = Number(didCoeff?.weight ?? didCoeff?.numerical_value ?? 0);

        // Extract other coefficients
        const coefficients: Record<string, number> = {};
        for (const w of weights) {
          const name = String(w.processed_input ?? w.category_name ?? w.feature ?? 'unknown');
          coefficients[name] = Number(w.weight ?? w.numerical_value ?? 0);
        }

        return {
          success: true,
          method: 'BQML_LINEAR_REG_DID',
          metrica: col,
          tratamento: { coluna: treatCol, valor: treatmentValue },
          data_corte: preCutoffDate,
          did_effect: didEffect,
          coefficients,
          group_stats: stats,
          interpretation: didEffect > 0
            ? `O tratamento está associado a um aumento de ${didEffect.toFixed(4)} na métrica ${col}.`
            : `O tratamento está associado a uma redução de ${Math.abs(didEffect).toFixed(4)} na métrica ${col}.`,
          model_info: { name: model, type: 'LINEAR_REG (DiD)' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: simple before/after comparison ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const [rows] = await bq.query({
            query: `
              SELECT
                CASE WHEN ${treatCol} = ${treatmentLiteral} THEN 'Tratado' ELSE 'Controle' END AS grupo,
                CASE WHEN data_base_report >= '${safeCutoff}' THEN 'Pós' ELSE 'Pré' END AS periodo,
                ${agg}(${col}) AS metrica_valor,
                COUNT(DISTINCT id_contrato) AS n_contratos
              FROM \`${dataset}.contratos\`
              WHERE TRUE${rangeFilter}
              GROUP BY 1, 2
              ORDER BY 1, 2`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          // Manual DiD calculation
          const cell = (g: string, p: string) =>
            Number((rows.find((r: Record<string, unknown>) => r.grupo === g && r.periodo === p) as Record<string, unknown>)?.metrica_valor ?? 0);
          const didEffect = (cell('Tratado', 'Pós') - cell('Tratado', 'Pré'))
            - (cell('Controle', 'Pós') - cell('Controle', 'Pré'));

          return {
            success: true,
            method: 'MANUAL_DID_FALLBACK',
            metrica: col,
            tratamento: { coluna: treatCol, valor: treatmentValue },
            did_effect: didEffect,
            group_stats: rows,
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
