import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeDate } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

export function createOptimizeAllocationTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Otimiza alocação de recursos usando BigQuery ML (LINEAR_REG para estimar retorno esperado por ação + scoring). Prioriza contratos por ROI estimado. Fallback para scoring ponderado.',
    inputSchema: z.object({
      acao: z.enum(['cobranca', 'repasse', 'reestruturacao']).describe('Tipo de ação para otimizar.'),
      orcamento: z.number().optional().describe('Orçamento total disponível (R$). Se omitido, retorna ranking sem restrição.'),
      topN: z.number().int().default(50).describe('Máximo de contratos a retornar.'),
    }),
    execute: async ({ acao: action, orcamento: budget, topN }) => {
      const model = sessionModelRef(dataset, `alloc_${action}`, ctx.sessionId);

      // ---------- Try BQML LINEAR_REG ----------
      try {
        // Train a model to predict recovery/outcome based on contract features
        const labelCol = action === 'cobranca'
          ? 'SAFE_DIVIDE(valor_atraso, NULLIF(saldo_devedor, 0))' // delinquency ratio as proxy
          : action === 'repasse'
            ? 'CASE WHEN elegibilidade = \'Elegivel\' THEN 1 ELSE 0 END' // repasse eligibility
            : 'CASE WHEN dias_atraso <= 30 THEN 1 ELSE 0 END'; // restructure success

        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${model}
           OPTIONS(
             model_type = 'LINEAR_REG',
             input_label_cols = ['outcome'],
             max_iterations = 20,
             l2_reg = 0.01,
             data_split_method = 'AUTO_SPLIT'
           ) AS
           SELECT
             ${labelCol} AS outcome,
             COALESCE(ltv, 0) AS ltv,
             COALESCE(dias_atraso, 0) AS dias_atraso,
             COALESCE(saldo_devedor, 0) AS saldo_devedor,
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
             DATE_DIFF(data_base_report, DATE(data_contrato), MONTH) AS meses_desde_originacao
           FROM \`${dataset}.contratos\`
           WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
             AND data_contrato IS NOT NULL ${buildAndClause(ctx, { dateMode: 'none' })}`,
        );

        // Score current portfolio
        const predictions = await queryBQML(
          dataset,
          `SELECT
             pred.id_contrato,
             c.nome_empreendimento,
             c.rating_liquid,
             c.saldo_devedor,
             c.dias_atraso,
             c.ltv,
             pred.predicted_outcome AS score,
             c.saldo_devedor * GREATEST(pred.predicted_outcome, 0) AS retorno_estimado
           FROM ML.PREDICT(MODEL ${model}, (
             SELECT
               id_contrato,
               COALESCE(ltv, 0) AS ltv,
               COALESCE(dias_atraso, 0) AS dias_atraso,
               COALESCE(saldo_devedor, 0) AS saldo_devedor,
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
               DATE_DIFF(data_base_report, DATE(data_contrato), MONTH) AS meses_desde_originacao
             FROM \`${dataset}.contratos\`
             WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
               AND data_contrato IS NOT NULL
               ${action === 'cobranca' ? 'AND dias_atraso > 0' : ''}
               ${action === 'repasse' ? 'AND dias_atraso <= 30' : ''}
               ${buildAndClause(ctx, { dateMode: 'none' })}
           )) pred
           JOIN \`${dataset}.contratos\` c
             ON c.id_contrato = pred.id_contrato
             AND c.data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
           ORDER BY pred.predicted_outcome DESC
           LIMIT ${topN}`,
        );

        // Apply budget constraint if specified
        let selected = predictions;
        let totalReturn = 0;
        let totalBalance = 0;

        if (budget != null) {
          selected = [];
          let spent = 0;
          for (const row of predictions) {
            const balance = Number(row.saldo_devedor ?? 0);
            if (spent + balance <= budget) {
              selected.push(row);
              spent += balance;
              totalReturn += Number(row.retorno_estimado ?? 0);
              totalBalance += balance;
            }
          }
        } else {
          for (const row of predictions) {
            totalReturn += Number(row.retorno_estimado ?? 0);
            totalBalance += Number(row.saldo_devedor ?? 0);
          }
        }

        return {
          success: true,
          method: 'BQML_LINEAR_REG',
          acao: action,
          orcamento: budget ?? 'sem restrição',
          total_contratos_selecionados: selected.length,
          total_saldo: totalBalance,
          retorno_estimado_total: totalReturn,
          roi_estimado: totalBalance > 0 ? (totalReturn / totalBalance) * 100 : 0,
          contratos: selected,
          model_info: { name: model, type: 'LINEAR_REG' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: weighted scoring ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const scoreExpr = action === 'cobranca'
            ? '0.4 * SAFE_DIVIDE(valor_atraso, saldo_devedor) + 0.3 * LEAST(dias_atraso / 180.0, 1) + 0.3 * LEAST(saldo_devedor / 1000000.0, 1)'
            : action === 'repasse'
              ? "0.5 * CASE WHEN elegibilidade = 'Elegivel' THEN 1 ELSE 0 END + 0.3 * (1 - COALESCE(ltv, 1.0)) + 0.2 * CASE WHEN dias_atraso = 0 THEN 1 ELSE 0 END"
              : `0.35 * LEAST(dias_atraso / 180.0, 1) + 0.35 * LEAST(saldo_devedor / 1000000.0, 1) + 0.3 * CASE WHEN rating_liquid IN ('E','F','G','H') THEN 1 ELSE 0 END`;

          const [rows] = await bq.query({
            query: `
              SELECT
                id_contrato, nome_empreendimento, rating_liquid,
                saldo_devedor, dias_atraso, ltv,
                ${scoreExpr} AS score
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
                ${action === 'cobranca' ? 'AND dias_atraso > 0' : ''}
                ${action === 'repasse' ? 'AND dias_atraso <= 30' : ''}
                ${buildAndClause(ctx, { dateMode: 'none' })}
              ORDER BY score DESC
              LIMIT ${topN}`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          return {
            success: true,
            method: 'WEIGHTED_SCORING_FALLBACK',
            acao: action,
            contratos: rows,
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
