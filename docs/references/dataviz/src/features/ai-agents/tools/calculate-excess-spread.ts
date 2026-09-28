import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCalculateExcessSpreadTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Calcula o excess spread da carteira: diferença entre rendimento dos ativos e custo das obrigações.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
      custoObrigacoes: z.number().default(0.12).describe('Taxa anual de custo das obrigações (ex: 0.12 = 12% a.a.).'),
      fees: z.number().default(0.01).describe('Taxa anual de fees/despesas (ex: 0.01 = 1% a.a.).'),
    }),
    execute: async ({ dataBase, custoObrigacoes: obligationCost, fees }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const [rows] = await bq.query({
          query: `
            SELECT
              SUM(saldo_devedor) as saldo_total,
              SAFE_DIVIDE(SUM(saldo_devedor * taxa_juros / 100), SUM(saldo_devedor)) as wac_estimado,
              SUM(saldo_devedor) * SAFE_DIVIDE(SUM(saldo_devedor * taxa_juros / 100), SUM(saldo_devedor)) / 12 as rendimento_mensal_estimado,
              SUM(saldo_devedor) * ${obligationCost} / 12 as custo_mensal,
              SUM(saldo_devedor) * ${fees} / 12 as fees_mensal
            FROM \`${dataset}.contratos\`
            WHERE data_base_report = '${safeDataBase}'
            ${buildAndClause(ctx, { dateMode: 'none' })}
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const r = rows[0] as Record<string, number> ?? {};
        const excessSpread = (r.wac_estimado ?? 0) - obligationCost - fees;
        return {
          success: true,
          dataBase,
          wac: r.wac_estimado,
          custoObrigacoes: obligationCost,
          fees,
          excessSpread,
          excessSpreadBps: excessSpread * 10000,
          rendimentoMensal: r.rendimento_mensal_estimado,
          custoMensal: r.custo_mensal,
          feesMensal: r.fees_mensal,
        };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
