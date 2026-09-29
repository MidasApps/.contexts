import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCompareCashflowsTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Compara fluxo de caixa esperado vs contratado, mostrando a diferença (haircut) por período.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
      horizonte: z.number().int().default(12).describe('Horizonte em meses para análise.'),
    }),
    execute: async ({ dataBase, horizonte: horizon }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const [rows] = await bq.query({
          query: `
            SELECT
              FORMAT_DATE('%Y-%m', data_base_fluxo) as mes,
              SUM(fluxo_esperado) as esperado,
              SUM(fluxo_contratado) as contratado,
              SUM(fluxo_contratado) - SUM(fluxo_esperado) as haircut,
              SAFE_DIVIDE(SUM(fluxo_esperado), SUM(fluxo_contratado)) * 100 as taxa_realizacao_pct
            FROM \`${dataset}.fluxo_caixa\`
            WHERE data_base_report = '${safeDataBase}'
              AND data_base_fluxo > '${safeDataBase}'
              AND data_base_fluxo <= DATE_ADD(DATE '${safeDataBase}', INTERVAL ${horizon} MONTH)
             
            GROUP BY mes
            ORDER BY mes
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const expectedTotal = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.esperado ?? 0), 0);
        const contractedTotal = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.contratado ?? 0), 0);
        return {
          success: true,
          dataBase,
          horizonte: horizon,
          totalEsperado: expectedTotal,
          totalContratado: contractedTotal,
          haircutTotal: contractedTotal - expectedTotal,
          taxaRealizacao: contractedTotal > 0 ? (expectedTotal / contractedTotal) * 100 : 0,
          rowCount: rows.length,
          data: rows,
        };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
