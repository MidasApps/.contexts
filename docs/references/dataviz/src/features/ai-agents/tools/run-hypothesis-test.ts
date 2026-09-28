import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeWhereClause } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createRunHypothesisTestTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Executa t-test aproximado via SQL comparando média de uma métrica entre dois grupos.',
    inputSchema: z.object({
      metric: z.string().describe('Coluna numérica a comparar.'),
      groupColumn: z.string().describe('Coluna categórica para dividir em 2 grupos.'),
      group1Value: z.string().describe('Valor do primeiro grupo.'),
      group2Value: z.string().describe('Valor do segundo grupo.'),
      whereClause: z.string().optional().describe('Filtro adicional.'),
    }),
    execute: async ({ metric, groupColumn, group1Value, group2Value, whereClause }) => {
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const safeMetric = metric.replace(/[^a-zA-Z0-9_]/g, '');
        const safeGroup = groupColumn.replace(/[^a-zA-Z0-9_]/g, '');
        const sanitizedWhere = whereClause ? safeWhereClause(whereClause) : '';
        const contextFilters = buildAndClause(ctx, { dateMode: 'snapshot' });
        const where = sanitizedWhere ? `AND ${sanitizedWhere} ${contextFilters}` : contextFilters;
        const [rows] = await bq.query({
          query: `
            SELECT
              ${safeGroup} as grupo,
              COUNT(*) as n,
              AVG(${safeMetric}) as media,
              STDDEV(${safeMetric}) as desvio
            FROM \`${dataset}.contratos\`
            WHERE ${safeGroup} IN ('${group1Value.replace(/'/g, "''")}', '${group2Value.replace(/'/g, "''")}') ${where}
            GROUP BY ${safeGroup}
            ORDER BY CASE WHEN ${safeGroup} = '${group1Value.replace(/'/g, "''")}' THEN 0 ELSE 1 END
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        if (rows.length < 2) return { success: false, error: 'Menos de 2 grupos encontrados.' };
        const g1 = rows[0] as Record<string, unknown>;
        const g2 = rows[1] as Record<string, unknown>;
        const n1 = Number(g1.n), mean1 = Number(g1.media), std1 = Number(g1.desvio);
        const n2 = Number(g2.n), mean2 = Number(g2.media), std2 = Number(g2.desvio);
        if (n1 < 2 || n2 < 2) return { success: false, error: 'Cada grupo precisa de pelo menos 2 observações para o teste t.' };
        const se1 = std1 / Math.sqrt(n1);
        const se2 = std2 / Math.sqrt(n2);
        const se = Math.sqrt(se1 * se1 + se2 * se2);
        if (se === 0) {
          return {
            success: true,
            grupo1: { nome: group1Value, n: n1, media: mean1, desvio: std1 },
            grupo2: { nome: group2Value, n: n2, media: mean2, desvio: std2 },
            tStatistic: 0,
            degreesOfFreedom: n1 + n2 - 2,
            tCritical: 1.96,
            significant: false,
            interpretation: mean1 === mean2
              ? 'Ambos os grupos têm valores idênticos — nenhuma diferença a testar.'
              : `Variância zero em ambos os grupos — teste t não aplicável.`,
          };
        }
        const tStat = (mean1 - mean2) / se;
        // Welch-Satterthwaite degrees of freedom
        const df = Math.pow(se1 * se1 + se2 * se2, 2) / (Math.pow(se1 * se1, 2) / (n1 - 1) + Math.pow(se2 * se2, 2) / (n2 - 1));
        // Approximate t-critical (conservative for small df)
        const tCritical = df < 30 ? 2.0 + 3.0 / df : 1.96;
        const significant = Math.abs(tStat) > tCritical;
        return {
          success: true,
          grupo1: { nome: group1Value, n: n1, media: mean1, desvio: std1 },
          grupo2: { nome: group2Value, n: n2, media: mean2, desvio: std2 },
          tStatistic: tStat,
          degreesOfFreedom: df,
          tCritical,
          significant,
          interpretation: significant
            ? `Diferença estatisticamente significativa (t=${tStat.toFixed(2)}, df=${df.toFixed(1)}, t_crit=${tCritical.toFixed(2)}, p<0.05)`
            : `Diferença não significativa (t=${tStat.toFixed(2)}, df=${df.toFixed(1)}, t_crit=${tCritical.toFixed(2)}, p>0.05)`,
        };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
