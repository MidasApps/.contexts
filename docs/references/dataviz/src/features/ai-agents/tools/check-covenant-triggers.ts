import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCheckCovenantTriggersTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Verifica gatilhos de covenant da operação de securitização contra thresholds definidos.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base do relatório (YYYY-MM-DD).'),
      thresholds: z.object({
        inadimplencia_max: z.number().default(7).describe('Inadimplência máxima (%). Padrão: 7%.'),
        over90_max: z.number().default(5).describe('Over 90 máximo (%). Padrão: 5%.'),
        elegibilidade_min: z.number().default(70).describe('Elegibilidade mínima (%). Padrão: 70%.'),
        ltv_max: z.number().default(80).describe('LTV médio máximo (%). Padrão: 80%.'),
      }).describe('Thresholds dos covenants.'),
    }),
    execute: async ({ dataBase, thresholds }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const [rows] = await bq.query({
          query: `
            SELECT
              COUNT(DISTINCT id_contrato) as total_contratos,
              SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 as inadimplencia_pct,
              SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100 as over90_pct,
              SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN elegibilidade = 'Elegivel' THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100 as elegibilidade_pct,
              AVG(ltv) * 100 as ltv_medio_pct
            FROM \`${dataset}.contratos\`
            WHERE data_base_report = '${safeDataBase}'
            ${buildAndClause(ctx, { dateMode: 'none' })}
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const metrics = rows[0] as Record<string, number> ?? {};
        if (!metrics.total_contratos || Number(metrics.total_contratos) === 0) {
          return { success: false, error: `Nenhum dado encontrado para data_base_report = '${safeDataBase}'.` };
        }
        const checks = [
          { covenant: 'Inadimplência', valor: metrics.inadimplencia_pct, limite: thresholds.inadimplencia_max, tipo: 'max', triggered: (metrics.inadimplencia_pct ?? 0) > thresholds.inadimplencia_max },
          { covenant: 'Over 90', valor: metrics.over90_pct, limite: thresholds.over90_max, tipo: 'max', triggered: (metrics.over90_pct ?? 0) > thresholds.over90_max },
          { covenant: 'Elegibilidade', valor: metrics.elegibilidade_pct, limite: thresholds.elegibilidade_min, tipo: 'min', triggered: (metrics.elegibilidade_pct ?? 0) < thresholds.elegibilidade_min },
          { covenant: 'LTV Médio', valor: metrics.ltv_medio_pct, limite: thresholds.ltv_max, tipo: 'max', triggered: (metrics.ltv_medio_pct ?? 0) > thresholds.ltv_max },
        ];
        const triggeredCount = checks.filter(c => c.triggered).length;
        return { success: true, dataBase, metrics, checks, triggeredCount, allClear: triggeredCount === 0 };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
