import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef, TABLES, type TableName } from '@/shared/lib/bigquery/client';

const TABLE_ENUM = z.enum(['contratos', 'pagamentos', 'fluxo_caixa']);

interface BigQueryField {
  name?: string;
  type?: string;
  description?: string;
  fields?: BigQueryField[];
  mode?: string;
}

function flattenFields(
  fields: BigQueryField[],
  prefix = '',
): { name: string; type: string; description: string }[] {
  const result: { name: string; type: string; description: string }[] = [];

  for (const field of fields) {
    const fullName = prefix ? `${prefix}.${field.name ?? ''}` : (field.name ?? '');
    result.push({
      name: fullName,
      type: field.type ?? 'UNKNOWN',
      description: field.description ?? '',
    });

    // Recurse into RECORD/STRUCT fields
    if (field.fields && field.fields.length > 0) {
      result.push(...flattenFields(field.fields, fullName));
    }
  }

  return result;
}

import type { ToolContext } from './tool-context';

export function createGetTableSchemaTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Retrieve the schema (column names, types, and descriptions) of a BigQuery table.',
    inputSchema: z.object({
      table: TABLE_ENUM.describe(
        'The table name to inspect. One of: contratos, pagamentos, fluxo_caixa.',
      ),
    }),
    execute: async ({ table }: { table: TableName }) => {
      try {
        const bigquery = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const tableRef = bigquery.dataset(datasetId, projectId ? { projectId } : undefined).table(TABLES[table]);
        const [metadata] = await tableRef.getMetadata();

        const schema = metadata.schema as { fields?: BigQueryField[] } | undefined;
        const fields = schema?.fields ?? [];

        return {
          success: true,
          table,
          fields: flattenFields(fields),
        };
      } catch (err) {
        return {
          success: false,
          error: formatToolError(err),
          table,
          fields: [] as { name: string; type: string; description: string }[],
        };
      }
    },
  });
}
