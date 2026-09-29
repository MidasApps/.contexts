import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createBuildVintageCurvesTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Constrói curvas vintage (cohort por safra de originação), mostrando a evolução de inadimplência por safra ao longo do tempo.',
    inputSchema: z.object({
      metric: z.enum(['inadimplencia_pct', 'over90_pct', 'saldo_devedor']).default('inadimplencia_pct').describe('Métrica a analisar por safra.'),
      topSafras: z.number().int().default(6).describe('Número de safras mais recentes a incluir.'),
      startDate: z.string().optional().describe('Data inicial (YYYY-MM-DD). Se omitida, inclui todos os dados.'),
      endDate: z.string().optional().describe('Data final (YYYY-MM-DD).'),
    }),
    execute: async ({ metric, topSafras: topVintages, startDate, endDate }) => {
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        let metricExpr: string;
        switch (metric) {
          case 'inadimplencia_pct': metricExpr = 'SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100'; break;
          case 'over90_pct': metricExpr = 'SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100'; break;
          case 'saldo_devedor': metricExpr = 'SUM(saldo_devedor)'; break;
        }
        const [rows] = await bq.query({
          query: `
            WITH top_safras AS (
              SELECT safra FROM \`${dataset}.contratos\`
              WHERE safra IS NOT NULL ${buildAndClause(ctx, { dateMode: 'snapshot' })}
              GROUP BY safra
              ORDER BY safra DESC LIMIT ${topVintages}
            )
            SELECT
              c.safra,
              FORMAT_DATE('%Y-%m', c.data_base_report) as mes,
              DATE_DIFF(c.data_base_report, DATE(CONCAT(c.safra, '-01')), MONTH) as meses_desde_originacao,
              ${metricExpr} as valor
            FROM \`${dataset}.contratos\` c
            INNER JOIN top_safras ts ON c.safra = ts.safra
            ${startDate && endDate ? `WHERE c.data_base_report BETWEEN '${safeDate(startDate)}' AND '${safeDate(endDate)}'` : 'WHERE 1=1'} ${buildAndClause(ctx, { dateMode: 'none' })}
            GROUP BY c.safra, mes, meses_desde_originacao
            ORDER BY c.safra, mes
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, metric, topSafras: topVintages, rowCount: rows.length, data: rows };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
