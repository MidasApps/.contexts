import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCalculateWalTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Calcula o WAL (Weighted Average Life) da carteira a partir da tabela fluxo_caixa.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
      useExpected: z.boolean().default(true).describe('Usar fluxo_esperado (true) ou fluxo_contratado (false).'),
    }),
    execute: async ({ dataBase, useExpected }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const cashflowCol = useExpected ? 'fluxo_esperado' : 'fluxo_contratado';
        const [rows] = await bq.query({
          query: `
            WITH fluxos AS (
              SELECT
                data_base_fluxo,
                DATE_DIFF(data_base_fluxo, DATE '${safeDataBase}', MONTH) / 12.0 as t_anos,
                SUM(${cashflowCol}) as cf
              FROM \`${dataset}.fluxo_caixa\`
              WHERE data_base_report = '${safeDataBase}' AND data_base_fluxo > '${safeDataBase}'
              GROUP BY data_base_fluxo
            )
            SELECT
              SAFE_DIVIDE(SUM(t_anos * cf), SUM(cf)) as wal_anos,
              SAFE_DIVIDE(SUM(t_anos * cf), SUM(cf)) * 12 as wal_meses,
              SUM(cf) as fluxo_total,
              COUNT(*) as num_periodos
            FROM fluxos
            WHERE cf > 0
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, dataBase, fluxoUsado: cashflowCol, result: rows[0] ?? {} };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
