import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createCalculateCoverageRatiosTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Calcula índices de cobertura (OC ratio e IC ratio) para avaliação da estrutura de securitização.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
      valorEmissao: z.number().positive().describe('Valor total da emissão de CRI/obrigação (R$).'),
    }),
    execute: async ({ dataBase, valorEmissao: issuanceValue }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const [contractRows] = await bq.query({
          query: `
            SELECT
              SUM(saldo_devedor) as saldo_total,
              SUM(pricing) as pricing_total,
              SUM(pdd_liquid) as pdd_total
            FROM \`${dataset}.contratos\`
            WHERE data_base_report = '${safeDataBase}'
            ${buildAndClause(ctx, { dateMode: 'none' })}
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const [cashflowRows] = await bq.query({
          query: `
            SELECT
              SUM(fluxo_esperado) as fluxo_esperado_total,
              SUM(fluxo_contratado) as fluxo_contratado_total
            FROM \`${dataset}.fluxo_caixa\`
            WHERE data_base_report = '${safeDataBase}' AND data_base_fluxo > '${safeDataBase}'
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        const c = contractRows[0] as Record<string, number> ?? {};
        const f = cashflowRows[0] as Record<string, number> ?? {};
        if (issuanceValue === 0) {
          return { success: false, error: 'valorEmissao não pode ser zero (divisão por zero).' };
        }
        const ocRatio = (c.saldo_total ?? 0) / issuanceValue;
        const icRatio = (f.fluxo_esperado_total ?? 0) / issuanceValue;
        return {
          success: true,
          dataBase,
          valorEmissao: issuanceValue,
          saldoTotal: c.saldo_total,
          pricingTotal: c.pricing_total,
          ocRatio,
          ocRatioPct: ocRatio * 100,
          icRatio,
          icRatioPct: icRatio * 100,
          fluxoEsperadoTotal: f.fluxo_esperado_total,
          fluxoContratadoTotal: f.fluxo_contratado_total,
          subordinacao: ocRatio > 1 ? (ocRatio - 1) * 100 : 0,
        };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
