import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDateOrMonth } from './bqml-utils';
import { validateColumn } from '@/features/ai-agents/lib/column-validator';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createDecomposeVariationTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Decompõe a variação de uma métrica entre dois períodos por dimensão, mostrando contribuição de cada grupo. Use para "por que o saldo subiu de jan a mar?" ou "qual rating mais contribuiu?". Requer dois períodos no formato YYYY-MM ou YYYY-MM-DD.',
    inputSchema: z.object({
      metric: z.string().describe('Coluna numérica para analisar variação. Valores válidos: saldo_devedor, valor_atraso, ltv, dias_atraso, pdd_liquid, pricing, etc.'),
      dimension: z.string().describe('Coluna de agrupamento. Valores válidos: rating_liquid, projeto, faixa_atraso, faixa_ltv, proponent_type, safra, grupos_repasse.'),
      aggregation: z.enum(['SUM', 'AVG', 'COUNT']).default('SUM').describe('Agregação: SUM para valores absolutos, AVG para métricas relativas (ltv, dias_atraso).'),
      period1: z.string().describe('Primeiro período (YYYY-MM-DD ou YYYY-MM).'),
      period2: z.string().describe('Segundo período (YYYY-MM-DD ou YYYY-MM).'),
    }),
    execute: async ({ metric, dimension, aggregation, period1, period2 }) => {
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const metricResult = validateColumn(metric, 'numeric');
        if (!metricResult.valid) return { success: false, error: metricResult.error };
        const safeMetric = metricResult.column;
        const dimResult = validateColumn(dimension, 'dimension');
        if (!dimResult.valid) return { success: false, error: dimResult.error };
        const safeDim = dimResult.column;
        const safePeriod1 = safeDateOrMonth(period1).substring(0, 7);
        const safePeriod2 = safeDateOrMonth(period2).substring(0, 7);
        const [rows] = await bq.query({
          query: `
            WITH p1 AS (
              SELECT ${safeDim}, ${aggregation}(${safeMetric}) as valor
              FROM \`${dataset}.contratos\`
              WHERE FORMAT_DATE('%Y-%m', data_base_report) = '${safePeriod1}' ${buildAndClause(ctx, { dateMode: 'none' })}
              GROUP BY ${safeDim}
            ),
            p2 AS (
              SELECT ${safeDim}, ${aggregation}(${safeMetric}) as valor
              FROM \`${dataset}.contratos\`
              WHERE FORMAT_DATE('%Y-%m', data_base_report) = '${safePeriod2}' ${buildAndClause(ctx, { dateMode: 'none' })}
              GROUP BY ${safeDim}
            )
            SELECT
              COALESCE(p1.${safeDim}, p2.${safeDim}) as grupo,
              COALESCE(p1.valor, 0) as valor_periodo1,
              COALESCE(p2.valor, 0) as valor_periodo2,
              COALESCE(p2.valor, 0) - COALESCE(p1.valor, 0) as variacao_absoluta,
              SAFE_DIVIDE(COALESCE(p2.valor, 0) - COALESCE(p1.valor, 0), NULLIF(COALESCE(p1.valor, 0), 0)) * 100 as variacao_pct
            FROM p1
            FULL OUTER JOIN p2 ON p1.${safeDim} = p2.${safeDim}
            ORDER BY ABS(COALESCE(p2.valor, 0) - COALESCE(p1.valor, 0)) DESC
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, metric: safeMetric, dimension: safeDim, period1, period2, rowCount: rows.length, data: rows };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
