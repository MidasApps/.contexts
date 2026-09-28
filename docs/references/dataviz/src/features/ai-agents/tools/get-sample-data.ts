import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { formatTableRef, getBigQueryClient, type TableName } from '@/shared/lib/bigquery/client';

const TABLE_ENUM = z.enum(['contratos', 'pagamentos', 'fluxo_caixa']);

import type { ToolContext } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export function createGetSampleDataTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Fetch a sample of rows from a BigQuery table to understand its structure and data.',
    inputSchema: z.object({
      table: TABLE_ENUM.describe('The table to sample. One of: contratos, pagamentos, fluxo_caixa.'),
      n: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe('Number of sample rows to return (default 5, max 20).'),
    }),
    execute: async ({ table, n }: { table: TableName; n: number }) => {
      const limit = Math.min(Math.max(1, n), 20);

      try {
        const bigquery = getBigQueryClient();

        const query = `SELECT * FROM ${formatTableRef(dataset, table)} LIMIT ${limit}`;

        const [rows] = await bigquery.query({
          query,
          useLegacySql: false,
          jobTimeoutMs: 60_000,
          maximumBytesBilled: String(maxBytesBilled()),
        });

        return {
          success: true,
          table,
          rowCount: rows.length,
          data: rows,
        };
      } catch (err) {
        return {
          success: false,
          error: formatToolError(err),
          table,
          rowCount: 0,
          data: [] as Record<string, unknown>[],
        };
      }
    },
  });
}
