import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createDecomposePaymentsTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Decompõe os pagamentos recebidos por tipo de recebimento (antecipado, vencimento, recuperação) ao longo do tempo.',
    inputSchema: z.object({
      startDate: z.string().optional().describe('Data inicial (YYYY-MM-DD). Se omitida, últimos 12 meses.'),
      endDate: z.string().optional().describe('Data final (YYYY-MM-DD).'),
    }),
    execute: async ({ startDate, endDate }) => {
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const dateFilter = startDate && endDate
          ? `WHERE data_base_report BETWEEN '${safeDate(startDate)}' AND '${safeDate(endDate)}'`
          : `WHERE data_base_report BETWEEN '${safeDate(ctx.filters.dateRange.start)}' AND '${safeDate(ctx.filters.dateRange.end)}'`;
        const [rows] = await bq.query({
          query: `
            SELECT
              FORMAT_DATE('%Y-%m', data_base_report) as mes,
              tipo_recebimento,
              SUM(valor_pago) as valor
            FROM \`${dataset}.pagamentos\`
            ${dateFilter}
            GROUP BY mes, tipo_recebimento
            ORDER BY mes, tipo_recebimento
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const [totals] = await bq.query({
          query: `
            SELECT
              tipo_recebimento,
              SUM(valor_pago) as valor_total,
              SAFE_DIVIDE(SUM(valor_pago), SUM(SUM(valor_pago)) OVER()) * 100 as pct
            FROM \`${dataset}.pagamentos\`
            ${dateFilter}
            GROUP BY tipo_recebimento
            ORDER BY valor_total DESC
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, rowCount: rows.length, byMonth: rows, totals };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
