import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createBuildTransitionMatrixTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Constrói uma matriz de transição de rating entre dois períodos consecutivos, mostrando probabilidades de migração.',
    inputSchema: z.object({
      period1: z.string().describe('Primeiro período (YYYY-MM-DD).'),
      period2: z.string().describe('Segundo período (YYYY-MM-DD).'),
    }),
    execute: async ({ period1, period2 }) => {
      try {
        const safePeriod1 = safeDate(period1);
        const safePeriod2 = safeDate(period2);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const [rows] = await bq.query({
          query: `
            WITH t1 AS (
              SELECT id_contrato, rating_liquid as rating_de
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safePeriod1}' ${buildAndClause(ctx, { dateMode: 'none' })}
            ),
            t2 AS (
              SELECT id_contrato, rating_liquid as rating_para
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safePeriod2}' ${buildAndClause(ctx, { dateMode: 'none' })}
            ),
            transitions AS (
              SELECT t1.rating_de, t2.rating_para, COUNT(*) as qtd
              FROM t1
              INNER JOIN t2 ON t1.id_contrato = t2.id_contrato
              GROUP BY t1.rating_de, t2.rating_para
            ),
            totals AS (
              SELECT rating_de, SUM(qtd) as total FROM transitions GROUP BY rating_de
            )
            SELECT
              tr.rating_de,
              tr.rating_para,
              tr.qtd,
              SAFE_DIVIDE(tr.qtd, tot.total) * 100 as probabilidade_pct
            FROM transitions tr
            JOIN totals tot ON tr.rating_de = tot.rating_de
            ORDER BY tr.rating_de, tr.rating_para
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, period1, period2, rowCount: rows.length, transitions: rows };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
