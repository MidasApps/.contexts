import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createGenerateComplianceReportTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Gera um relatório estruturado de compliance da carteira, incluindo elegibilidade, concentração, covenants e PDD.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base do relatório (YYYY-MM-DD).'),
    }),
    execute: async ({ dataBase }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const opts = { useLegacySql: false, defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) }, jobTimeoutMs: 60_000 };

        const [[summary], [concentration], [pddAnalysis]] = await Promise.all([
          bq.query({ ...opts, maximumBytesBilled: String(maxBytesBilled()), query: `
            SELECT
              COUNT(DISTINCT id_contrato) as total_contratos,
              SUM(saldo_devedor) as saldo_total,
              SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 as inadimplencia_pct,
              SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100 as over90_pct,
              SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN elegibilidade = 'Elegivel' THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100 as elegibilidade_pct,
              AVG(ltv) * 100 as ltv_medio_pct,
              SUM(pdd_liquid) as pdd_liquid_total,
              SUM(pdd_minimo_bacen) as pdd_bacen_total,
              SUM(pdd_liquid) - SUM(pdd_minimo_bacen) as delta_pdd
            FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx, { dateMode: 'none' })}
          ` }),
          bq.query({ ...opts, maximumBytesBilled: String(maxBytesBilled()), query: `
            SELECT documento, nome_cliente, SUM(saldo_devedor) as saldo,
              SAFE_DIVIDE(SUM(saldo_devedor), SUM(SUM(saldo_devedor)) OVER()) * 100 as pct
            FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx, { dateMode: 'none' })}
            GROUP BY documento, nome_cliente ORDER BY saldo DESC LIMIT 5
          ` }),
          bq.query({ ...opts, maximumBytesBilled: String(maxBytesBilled()), query: `
            SELECT rating_liquid, COUNT(DISTINCT id_contrato) as contratos,
              SUM(saldo_devedor) as saldo, SUM(pdd_liquid) as pdd_liquid, SUM(pdd_minimo_bacen) as pdd_bacen
            FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx, { dateMode: 'none' })}
            GROUP BY rating_liquid ORDER BY rating_liquid
          ` }),
        ]);

        return {
          success: true,
          dataBase,
          summary: summary[0] ?? {},
          topDevedores: concentration,
          pddByRating: pddAnalysis,
        };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
