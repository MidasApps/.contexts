import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { safeDate } from './bqml-utils';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createRankActionsTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description: 'Ranking multicritério de contratos para priorização de ações (cobrança, repasse, reestruturação) via SQL ponderado.',
    inputSchema: z.object({
      dataBase: z.string().describe('Data-base de referência (YYYY-MM-DD).'),
      acao: z.enum(['cobranca', 'repasse', 'reestruturacao']).describe('Tipo de ação para priorizar.'),
      limit: z.number().int().default(20).describe('Número de contratos a retornar.'),
    }),
    execute: async ({ dataBase, acao: action, limit }) => {
      try {
        const safeDataBase = safeDate(dataBase);
        const bq = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        let scoreExpr: string;
        switch (action) {
          case 'cobranca':
            scoreExpr = `SAFE_DIVIDE(valor_atraso, saldo_devedor) * 40 + LEAST(dias_atraso / 180.0, 1) * 30 + LEAST(saldo_devedor / 1000000.0, 1) * 30`;
            break;
          case 'repasse':
            scoreExpr = `(CASE WHEN elegibilidade = 'Elegivel' THEN 50 ELSE 0 END) + (CASE WHEN ltv <= 0.8 THEN 30 ELSE 0 END) + (CASE WHEN dias_atraso = 0 THEN 20 ELSE 0 END)`;
            break;
          case 'reestruturacao':
            scoreExpr = `LEAST(dias_atraso / 180.0, 1) * 35 + LEAST(saldo_devedor / 1000000.0, 1) * 35 + (CASE WHEN rating_liquid IN ('E','F','G','H') THEN 30 ELSE 0 END)`;
            break;
        }
        const [rows] = await bq.query({
          query: `
            SELECT
              id_contrato, nome_cliente, projeto, rating_liquid, dias_atraso,
              saldo_devedor, valor_atraso, ltv, elegibilidade,
              ${scoreExpr} as score_priorizacao
            FROM \`${dataset}.contratos\`
            WHERE data_base_report = '${safeDataBase}'
              ${action === 'cobranca' ? 'AND dias_atraso > 0' : ''}
              ${action === 'repasse' ? 'AND dias_atraso <= 30' : ''}
              ${buildAndClause(ctx, { dateMode: 'none' })}
            ORDER BY score_priorizacao DESC
            LIMIT ${limit}
          `,
          useLegacySql: false,
          defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        return { success: true, acao: action, dataBase, rowCount: rows.length, contratos: rows };
      } catch (err) {
        return { success: false, error: formatToolError(err) };
      }
    },
  });
}
