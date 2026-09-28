import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCheckEligibilityTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Verifica a elegibilidade CRI dos contratos com base em critérios regulatórios (LTV, dias de atraso, rating, elegibilidade).',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base do relatório (YYYY-MM-DD).'),
      maxLtv: z.number().default(0.8).describe('LTV máximo (decimal: 0.8 = 80%). O campo ltv no BigQuery é decimal (ex: 0.53 = 53%).'),
      maxDiasAtraso: z.number().int().default(90).describe('Dias de atraso máximo.'),
      minRating: z.string().default('D').describe('Rating mínimo aceitável (A=melhor, H=pior).'),
    }),
    execute: async ({ dataBase, maxLtv, maxDiasAtraso: maxDaysPastDue, minRating }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const ratingOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const ratingIdx = ratingOrder.indexOf(minRating);
        if (ratingIdx === -1) {
          return { success: false, error: `Rating inválido: "${minRating}". Use A a H.` };
        }
        const validRatings = ratingOrder.slice(0, ratingIdx + 1);
        const ratingIn = validRatings.map(r => `'${r}'`).join(',');
        const [rows] = await bq.query({
          query: `
            SELECT
              COUNT(DISTINCT id_contrato) as total_contratos,
              COUNTIF(ltv <= ${maxLtv} AND dias_atraso <= ${maxDaysPastDue} AND rating_liquid IN (${ratingIn}) AND COALESCE(restricoes, 0) = 0) as elegiveis_criterio,
              COUNTIF(elegibilidade = 'Elegivel') as elegiveis_atual,
              COUNTIF(ltv > ${maxLtv}) as reprovados_ltv,
              COUNTIF(dias_atraso > ${maxDaysPastDue}) as reprovados_atraso,
              COUNTIF(rating_liquid NOT IN (${ratingIn})) as reprovados_rating,
              COUNTIF(COALESCE(restricoes, 0) > 0) as reprovados_restricoes,
              SUM(saldo_devedor) as saldo_total,
              SUM(CASE WHEN ltv <= ${maxLtv} AND dias_atraso <= ${maxDaysPastDue} AND rating_liquid IN (${ratingIn}) AND COALESCE(restricoes, 0) = 0 THEN saldo_devedor ELSE 0 END) as saldo_elegivel
            FROM \`${dataset}.contratos\`
            WHERE data_base_report = '${safeDataBase}'
            ${buildAndClause(ctx, { dateMode: 'none' })}
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, criteria: { maxLtv, maxDiasAtraso: maxDaysPastDue, minRating, validRatings }, result: rows[0] ?? {} };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
