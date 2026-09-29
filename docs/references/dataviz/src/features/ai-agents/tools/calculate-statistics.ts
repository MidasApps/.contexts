import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeWhereClause } from './bqml-utils';
import { validateColumn } from '@/features/ai-agents/lib/column-validator';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCalculateStatisticsTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Calcula estatísticas descritivas (média, mediana, percentis p25/p50/p75/p90/p95/p99, desvio padrão, min, max) de uma coluna numérica. Use para "como está distribuído o LTV?" ou "qual a média de saldo devedor?". Filtros ativos são aplicados automaticamente.',
    inputSchema: z.object({
      column: z.string().describe(
        'Coluna numérica da tabela contratos. Valores válidos: saldo_devedor, saldo_nominal, valor_imovel, ltv, dias_atraso, valor_atraso, valor_over_90, pdd_liquid, pdd_minimo_bacen, delta_pdd, pricing, taxa_juros, prazo_decorrido, prazo_remanescente, private_area. Use APENAS o nome da coluna, sem expressões SQL.'
      ),
      whereClause: z.string().optional().describe(
        'Filtro SQL adicional SEM a palavra WHERE. Ex: "rating_liquid = \'A\'" ou "dias_atraso > 90". Filtros de data/projeto já aplicados automaticamente — use apenas para filtros extras.'
      ),
    }),
    execute: async ({ column, whereClause }) => {
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const validation = validateColumn(column, 'numeric');
        if (!validation.valid) return { success: false, error: validation.error };
        const safeCol = validation.column;
        const sanitizedWhere = whereClause ? safeWhereClause(whereClause) : '';
        const contextFilters = buildAndClause(ctx, { dateMode: 'snapshot' });
        const where = sanitizedWhere
          ? `WHERE ${sanitizedWhere} ${contextFilters}`
          : contextFilters
            ? `WHERE 1=1 ${contextFilters}`
            : '';
        const [rows] = await bq.query({
          query: `
            SELECT
              COUNT(*) as n,
              AVG(${safeCol}) as media,
              STDDEV(${safeCol}) as desvio_padrao,
              MIN(${safeCol}) as minimo,
              MAX(${safeCol}) as maximo,
              APPROX_QUANTILES(${safeCol}, 100)[OFFSET(25)] as p25,
              APPROX_QUANTILES(${safeCol}, 100)[OFFSET(50)] as mediana,
              APPROX_QUANTILES(${safeCol}, 100)[OFFSET(75)] as p75,
              APPROX_QUANTILES(${safeCol}, 100)[OFFSET(90)] as p90,
              APPROX_QUANTILES(${safeCol}, 100)[OFFSET(95)] as p95,
              APPROX_QUANTILES(${safeCol}, 100)[OFFSET(99)] as p99
            FROM \`${dataset}.contratos\`
            ${where}
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, column: safeCol, statistics: rows[0] ?? {} };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
