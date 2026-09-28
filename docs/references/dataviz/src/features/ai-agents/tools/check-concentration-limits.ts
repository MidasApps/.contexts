import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCheckConcentrationLimitsTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Verifica limites de concentração CVM 60 (máx 20% por devedor) na carteira.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base do relatório (YYYY-MM-DD).'),
      limitePct: z.number().default(20).describe('Limite percentual por devedor (padrão CVM 60: 20%).'),
    }),
    execute: async ({ dataBase, limitePct: limitPct }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const [rows] = await bq.query({
          query: `
            WITH por_devedor AS (
              SELECT
                documento,
                nome_cliente,
                COUNT(DISTINCT id_contrato) as num_contratos,
                SUM(saldo_devedor) as saldo,
                SAFE_DIVIDE(SUM(saldo_devedor), SUM(SUM(saldo_devedor)) OVER()) * 100 as pct_carteira
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safeDataBase}'
              ${buildAndClause(ctx, { dateMode: 'none' })}
              GROUP BY documento, nome_cliente
            )
            SELECT
              documento,
              nome_cliente,
              num_contratos,
              saldo,
              pct_carteira,
              CASE WHEN pct_carteira > ${limitPct} THEN true ELSE false END as excede_limite
            FROM por_devedor
            WHERE pct_carteira > ${limitPct * 0.8}
            ORDER BY pct_carteira DESC
            LIMIT 20
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const violations = rows.filter((r: Record<string, unknown>) => r.excede_limite);
        return {
          success: true,
          limitePct: limitPct,
          totalViolations: violations.length,
          nearLimitCount: rows.length,
          devedores: rows,
        };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
