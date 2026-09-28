import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createRunScenarioTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Executa cenários determinísticos (base, conservador, adverso, severo) combinando múltiplos parâmetros de stress.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
      cenario: z.enum(['base', 'conservador', 'adverso', 'severo']).describe('Tipo de cenário pré-definido.'),
    }),
    execute: async ({ dataBase, cenario: scenario }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const params: Record<string, { desvalorizacao: number; aumento_atraso: number; pct_afetados: number }> = {
          base: { desvalorizacao: 0, aumento_atraso: 0, pct_afetados: 0 },
          conservador: { desvalorizacao: -0.05, aumento_atraso: 15, pct_afetados: 0.05 },
          adverso: { desvalorizacao: -0.15, aumento_atraso: 60, pct_afetados: 0.25 },
          severo: { desvalorizacao: -0.30, aumento_atraso: 90, pct_afetados: 0.40 },
        };
        const p = params[scenario];
        const ltvFactor = 1 / (1 + p.desvalorizacao);
        const [rows] = await bq.query({
          query: `
            WITH base AS (
              SELECT *,
                ltv * ${ltvFactor} AS ltv_stressed,
                CASE
                  WHEN MOD(ABS(FARM_FINGERPRINT(CAST(id_contrato AS STRING))), 100) < ${p.pct_afetados * 100} THEN dias_atraso + ${p.aumento_atraso}
                  ELSE dias_atraso
                END AS dias_atraso_stressed
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx, { dateMode: 'none' })}
            )
            SELECT
              '${scenario}' as cenario,
              COUNT(DISTINCT id_contrato) as total_contratos,
              SUM(saldo_devedor) as saldo_total,
              AVG(ltv) as ltv_atual,
              AVG(ltv_stressed) as ltv_stressed,
              SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100 as inadimplencia_valor_pct,
              SAFE_DIVIDE(COUNTIF(dias_atraso > 90), COUNT(DISTINCT id_contrato)) * 100 as over90_atual_pct,
              SAFE_DIVIDE(COUNTIF(dias_atraso_stressed > 90), COUNT(DISTINCT id_contrato)) * 100 as over90_stressed_pct,
              COUNTIF(ltv_stressed > 0.8) as contratos_ltv_above_80_stressed,
              COUNTIF(dias_atraso_stressed > 90) as contratos_over90_stressed,
              SUM(pdd_liquid) as pdd_atual,
              SUM(pdd_minimo_bacen) as pdd_bacen_atual
            FROM base
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, cenario: scenario, params: p, result: rows[0] ?? {} };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
