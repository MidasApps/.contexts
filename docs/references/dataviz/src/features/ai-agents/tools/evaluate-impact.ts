import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createEvaluateImpactTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Avalia o impacto de uma ação comparando métricas before/after entre dois períodos.',
    inputSchema: z.object({
      periodoBefore: z.string().describe('Período antes da ação (YYYY-MM-DD).'),
      periodoAfter: z.string().describe('Período após a ação (YYYY-MM-DD).'),
      metricas: z.array(z.string()).describe('Métricas a comparar (ex: inadimplencia_pct, valor_atraso).'),
    }),
    execute: async ({ periodoBefore: periodBefore, periodoAfter: periodAfter, metricas: metrics }) => {
      try {
        const safeBefore = safeDate(periodBefore);
        const safeAfter = safeDate(periodAfter);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const metricExprs = metrics.map(m => {
          const safe = m.replace(/[^a-zA-Z0-9_]/g, '');
          if (safe === 'inadimplencia_pct') return `SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 as ${safe}`;
          if (safe === 'over90_pct') return `SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100 as ${safe}`;
          return `SUM(${safe}) as ${safe}`;
        });
        const selectExpr = metricExprs.join(', ');
        const [beforeRows] = await bq.query({
          query: `SELECT 'before' as periodo, ${selectExpr} FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeBefore}' ${buildAndClause(ctx, { dateMode: 'none' })}`,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const [afterRows] = await bq.query({
          query: `SELECT 'after' as periodo, ${selectExpr} FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeAfter}' ${buildAndClause(ctx, { dateMode: 'none' })}`,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const before = beforeRows[0] as Record<string, unknown> ?? {};
        const after = afterRows[0] as Record<string, unknown> ?? {};
        const deltas: Record<string, unknown> = {};
        for (const m of metrics) {
          const safe = m.replace(/[^a-zA-Z0-9_]/g, '');
          const b = Number(before[safe] ?? 0);
          const a = Number(after[safe] ?? 0);
          deltas[safe] = { before: b, after: a, delta: a - b, deltaPct: b !== 0 ? ((a - b) / b) * 100 : 0 };
        }
        return { success: true, periodoBefore: periodBefore, periodoAfter: periodAfter, deltas };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
