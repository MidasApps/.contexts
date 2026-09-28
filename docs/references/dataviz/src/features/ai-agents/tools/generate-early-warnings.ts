import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createGenerateEarlyWarningsTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Gera score de early warning baseado em sinais de deterioração: migração de rating, aumento de atraso, LTV crescente.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base atual (YYYY-MM-DD).'),
      dataBaseAnterior: z.string().describe('Data-base anterior para comparação (YYYY-MM-DD).'),
    }),
    execute: async ({ dataBase, dataBaseAnterior: previousBaseDate }) => {
      const sanitizedDate = safeDate(dataBase);
      const sanitizedPreviousDate = safeDate(previousBaseDate);
      try {
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const [rows] = await bq.query({
          query: `
            WITH atual AS (
              SELECT id_contrato, rating_liquid, dias_atraso, ltv, saldo_devedor
              FROM \`${dataset}.contratos\` WHERE data_base_report = '${sanitizedDate}' ${buildAndClause(ctx, { dateMode: 'none' })}
            ),
            anterior AS (
              SELECT id_contrato, rating_liquid as rating_ant, dias_atraso as atraso_ant, ltv as ltv_ant
              FROM \`${dataset}.contratos\` WHERE data_base_report = '${sanitizedPreviousDate}' ${buildAndClause(ctx, { dateMode: 'none' })}
            ),
            sinais AS (
              SELECT
                a.id_contrato,
                a.rating_liquid,
                a.dias_atraso,
                a.ltv,
                a.saldo_devedor,
                CASE WHEN (CASE a.rating_liquid WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 WHEN 'E' THEN 5 WHEN 'F' THEN 6 WHEN 'G' THEN 7 WHEN 'H' THEN 8 ELSE 9 END) > (CASE ant.rating_ant WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 WHEN 'E' THEN 5 WHEN 'F' THEN 6 WHEN 'G' THEN 7 WHEN 'H' THEN 8 ELSE 9 END) THEN 1 ELSE 0 END as sinal_rating_piora,
                CASE WHEN a.dias_atraso > ant.atraso_ant + 30 THEN 1 ELSE 0 END as sinal_atraso_crescente,
                CASE WHEN a.ltv > ant.ltv_ant + 0.05 THEN 1 ELSE 0 END as sinal_ltv_crescente,
                CASE WHEN a.dias_atraso > 0 AND ant.atraso_ant = 0 THEN 1 ELSE 0 END as sinal_nova_inadimplencia
              FROM atual a
              LEFT JOIN anterior ant ON a.id_contrato = ant.id_contrato
            )
            SELECT
              SUM(sinal_rating_piora) as contratos_rating_piora,
              SUM(sinal_atraso_crescente) as contratos_atraso_crescente,
              SUM(sinal_ltv_crescente) as contratos_ltv_crescente,
              SUM(sinal_nova_inadimplencia) as novas_inadimplencias,
              COUNT(*) as total_contratos,
              SUM(CASE WHEN sinal_rating_piora + sinal_atraso_crescente + sinal_ltv_crescente + sinal_nova_inadimplencia >= 2 THEN saldo_devedor ELSE 0 END) as saldo_alto_risco
            FROM sinais
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, dataBase, dataBaseAnterior: previousBaseDate, warnings: rows[0] ?? {} };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
