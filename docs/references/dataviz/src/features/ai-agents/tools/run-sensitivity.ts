import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createRunSensitivityTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Executa análise de sensibilidade OAT (One-at-a-Time): varia um parâmetro enquanto mantém outros fixos.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
      parametro: z.enum(['ltv_limit', 'dias_atraso_limit', 'desvalorizacao']).describe('Parâmetro a variar.'),
      valores: z.array(z.number()).max(20).describe('Lista de valores a testar (máx 20).'),
    }),
    execute: async ({ dataBase, parametro: parameter, valores: values }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const results = [];
        for (const val of values) {
          let query: string;
          switch (parameter) {
            case 'ltv_limit':
              query = `SELECT ${val} as param_value, COUNTIF(ltv <= ${val}) as elegiveis, COUNT(*) as total, SAFE_DIVIDE(COUNTIF(ltv <= ${val}), COUNT(*)) * 100 as pct FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx, { dateMode: 'none' })}`;
              break;
            case 'dias_atraso_limit':
              query = `SELECT ${val} as param_value, COUNTIF(dias_atraso <= ${val}) as elegiveis, COUNT(*) as total, SAFE_DIVIDE(COUNTIF(dias_atraso <= ${val}), COUNT(*)) * 100 as pct FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx, { dateMode: 'none' })}`;
              break;
            case 'desvalorizacao':
              query = `SELECT ${val} as param_value, AVG(SAFE_DIVIDE(saldo_devedor, valor_imovel * (1 + ${val}))) as ltv_medio_stressed, COUNTIF(SAFE_DIVIDE(saldo_devedor, valor_imovel * (1 + ${val})) > 0.8) as acima_80 FROM \`${dataset}.contratos\` WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx, { dateMode: 'none' })}`;
              break;
          }
          const [rows] = await bq.query({
            query,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });
          results.push(rows[0]);
        }
        return { success: true, parametro: parameter, valores: values, results };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
