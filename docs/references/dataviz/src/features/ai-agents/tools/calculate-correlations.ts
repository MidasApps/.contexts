import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeWhereClause } from './bqml-utils';
import { validateColumn } from '@/features/ai-agents/lib/column-validator';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCalculateCorrelationsTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Calcula correlação de Pearson e Spearman entre duas variáveis numéricas. Use para "existe correlação entre LTV e atraso?" Retorna coeficientes e força (fraca < 0.4, moderada 0.4-0.7, forte > 0.7). Filtros ativos aplicados automaticamente.',
    inputSchema: z.object({
      column1: z.string().describe('Primeira coluna numérica. Valores válidos: saldo_devedor, ltv, dias_atraso, valor_atraso, pdd_liquid, taxa_juros, prazo_decorrido, prazo_remanescente, etc.'),
      column2: z.string().describe('Segunda coluna numérica (diferente da primeira). Mesmos valores válidos.'),
      whereClause: z.string().optional().describe('Filtro SQL adicional SEM WHERE. Filtros de data/projeto já aplicados.'),
    }),
    execute: async ({ column1, column2, whereClause }) => {
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const c1Result = validateColumn(column1, 'numeric');
        if (!c1Result.valid) return { success: false, error: c1Result.error };
        const c1 = c1Result.column;
        const c2Result = validateColumn(column2, 'numeric');
        if (!c2Result.valid) return { success: false, error: c2Result.error };
        const c2 = c2Result.column;
        const sanitizedWhere = whereClause ? safeWhereClause(whereClause) : '';
        const contextFilters = buildAndClause(ctx, { dateMode: 'snapshot' });
        const where = sanitizedWhere
          ? `WHERE ${c1} IS NOT NULL AND ${c2} IS NOT NULL AND ${sanitizedWhere} ${contextFilters}`
          : `WHERE ${c1} IS NOT NULL AND ${c2} IS NOT NULL ${contextFilters}`;
        const [rows] = await bq.query({
          query: `
            WITH ranked AS (
              SELECT
                ${c1}, ${c2},
                RANK() OVER (ORDER BY ${c1}) AS rank1,
                RANK() OVER (ORDER BY ${c2}) AS rank2
              FROM \`${dataset}.contratos\`
              ${where}
            )
            SELECT
              COUNT(*) as n,
              CORR(${c1}, ${c2}) as pearson,
              CORR(rank1, rank2) as spearman,
              AVG(${c1}) as media_col1,
              AVG(${c2}) as media_col2,
              STDDEV(${c1}) as std_col1,
              STDDEV(${c2}) as std_col2
            FROM ranked
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const r = rows[0] as Record<string, number> ?? {};
        const pearson = r.pearson ?? 0;
        let strength = 'fraca';
        if (Math.abs(pearson) > 0.7) strength = 'forte';
        else if (Math.abs(pearson) > 0.4) strength = 'moderada';
        return { success: true, column1: c1, column2: c2, pearson, spearman: r.spearman, strength, n: r.n };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
