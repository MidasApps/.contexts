import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeWhereClause } from './bqml-utils';
import { validateColumn } from '@/features/ai-agents/lib/column-validator';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCalculateHhiTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Calcula o índice Herfindahl-Hirschman (HHI) de concentração. Use para "qual a concentração por devedor?" ou "existe risco de concentração?". HHI > 2500 = alta, 1500-2500 = moderada, < 1500 = baixa. Filtros ativos aplicados automaticamente.',
    inputSchema: z.object({
      dimension: z.string().describe('Coluna de agrupamento. Valores válidos: documento (por devedor), projeto (por empreendimento), rating_liquid (por rating), faixa_atraso, faixa_ltv, proponent_type, grupos_repasse, safra.'),
      valueColumn: z.string().default('saldo_devedor').describe('Coluna numérica para calcular participação. Default: saldo_devedor. Outras: saldo_nominal, valor_imovel, pricing.'),
      whereClause: z.string().optional().describe('Filtro SQL adicional SEM a palavra WHERE. Filtros de data/projeto já aplicados.'),
    }),
    execute: async ({ dimension, valueColumn, whereClause }) => {
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const dimResult = validateColumn(dimension, 'dimension');
        if (!dimResult.valid) return { success: false, error: dimResult.error };
        const safeDim = dimResult.column;
        const valResult = validateColumn(valueColumn, 'numeric');
        if (!valResult.valid) return { success: false, error: valResult.error };
        const safeVal = valResult.column;
        const sanitizedWhere = whereClause ? safeWhereClause(whereClause) : '';
        const contextFilters = buildAndClause(ctx, { dateMode: 'snapshot' });
        const where = sanitizedWhere
          ? `WHERE ${sanitizedWhere} ${contextFilters}`
          : contextFilters
            ? `WHERE 1=1 ${contextFilters}`
            : '';
        const [rows] = await bq.query({
          query: `
            WITH shares AS (
              SELECT
                ${safeDim},
                SAFE_DIVIDE(SUM(${safeVal}), SUM(SUM(${safeVal})) OVER()) as share
              FROM \`${dataset}.contratos\`
              ${where}
              GROUP BY ${safeDim}
            )
            SELECT
              SUM(POWER(share, 2)) * 10000 as hhi,
              COUNT(*) as num_grupos,
              MAX(share) as maior_participacao,
              ARRAY_AGG(STRUCT(${safeDim} as grupo, share as participacao) ORDER BY share DESC LIMIT 10) as top_10
            FROM shares
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const result = rows[0] ?? {};
        const hhi = Number(result.hhi ?? 0);
        let interpretation = 'Concentração baixa (mercado competitivo)';
        if (hhi > 2500) interpretation = 'Concentração alta (risco de concentração)';
        else if (hhi > 1500) interpretation = 'Concentração moderada';
        return { success: true, dimension: safeDim, hhi, interpretation, details: result };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
