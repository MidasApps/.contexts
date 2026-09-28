import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { maxBytesBilled, isBytesBilledError, BYTES_CAP_TOOL_MESSAGE } from '@/shared/lib/bigquery/cost-guard';
import { checkTenantQuery } from '@/features/ai-agents/lib/tenant-query';
import { lazyClientQueryScope } from '@/features/ai-agents/lib/client-query-scope';
import { persistSqlGeneration } from '@/shared/lib/memory/persist-sql';
import { canonicalSqlHash } from '@/features/sql-catalog/hash';
import { incrementCatalogUse } from '@/features/sql-catalog/use-count-hook';

const MAX_ROWS = 500;
const MAX_RESULT_CHARS = 50_000;

import type { ToolContext } from './tool-context';

export function createExecuteSqlTool(ctx: ToolContext) {
  const { dataset } = ctx;
  // Datasets vinculados ao cliente, lidos do Firestore no servidor (ADR-0006).
  const scope = lazyClientQueryScope({ clientId: ctx.clientId, dataset });
  return tool({
    description:
      'Executa uma query SQL read-only no BigQuery. Retorna até 500 linhas. Use para consultas customizadas que não têm ferramenta dedicada (rankings, segmentações, joins). Filtros de data e projeto do dashboard são aplicados pelo agente — inclua-os na query manualmente.',
    inputSchema: z.object({
      query: z.string().describe(
        'Query SQL SELECT ou WITH (CTE). Apenas leitura — DML/DDL bloqueados. Tabelas disponíveis: contratos, pagamentos, fluxo_caixa. Use SAFE_DIVIDE para divisões, FORMAT_DATE para datas, LIMIT para queries exploratórias. Sempre inclua filtros de data_base_report e projeto na WHERE clause.'
      ),
    }),
    execute: async ({ query }: { query: string }) => {
      // Guardrail em `lib/sql-guard.ts` (fonte única). A denylist que ficava
      // aqui rodava sobre o texto CRU: `DROP/**​/TABLE` não casava com `\s+` e
      // passava, `EXPORT DATA` — a exfiltração mais direta do BigQuery — não
      // estava na lista, e literal contendo palavra proibida era falso positivo.
      //
      // A guarda de texto sozinha não basta: ela modela o léxico do BigQuery e
      // já divergiu dele (`SELECT 1 --\r; DROP …` passava). `checkTenantQuery`
      // roda a guarda E um dry-run, e só segue se o PRÓPRIO BigQuery classificar
      // a query como um único SELECT — e se toda tabela/rotina que ela lê for
      // de um dataset do cliente (`defaultDataset` não impedia nome qualificado).
      const check = await checkTenantQuery(query, scope);
      if (!check.ok) {
        return { success: false, code: check.code, error: check.error, query };
      }

      const start = performance.now();
      try {
        const bigquery = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);

        const [rows] = await bigquery.query({
          // Exatamente o texto que o dry-run validou.
          query: check.sql,
          useLegacySql: false,
          defaultDataset: {
            datasetId,
            ...(projectId ? { projectId } : {}),
          },
          jobTimeoutMs: 60_000,
          // Teto DURO de custo. O SQL aqui é gerado por LLM: o filtro de
          // FORBIDDEN_KEYWORDS impede escrita, não impede varrer a tabela
          // inteira. `maximumBytesBilled` faz o BigQuery REJEITAR o job antes
          // de faturar, em vez de rodar e cobrar (rules/cost.md).
          maximumBytesBilled: String(maxBytesBilled()),
        });

        const totalRows = rows.length;
        let truncatedRows = rows.slice(0, MAX_ROWS);

        // Check character limit
        const serialized = JSON.stringify(truncatedRows);
        let charTruncated = false;
        if (serialized.length > MAX_RESULT_CHARS) {
          // Binary search for max rows that fit in char budget
          let lo = 0, hi = truncatedRows.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (JSON.stringify(truncatedRows.slice(0, mid)).length <= MAX_RESULT_CHARS) {
              lo = mid;
            } else {
              hi = mid - 1;
            }
          }
          truncatedRows = truncatedRows.slice(0, lo);
          charTruncated = true;
        }

        const latencyMs = performance.now() - start;

        // Sprint 3.A — fire-and-forget persistence for semantic recall.
        if (ctx.clientId && ctx.personaId) {
          void persistSqlGeneration({
            clientId: ctx.clientId,
            personaId: ctx.personaId,
            // intent unavailable at this layer; use query head as proxy.
            intent: query.slice(0, 200),
            sql: query,
            schemaSnapshot: { columns: truncatedRows[0] ? Object.keys(truncatedRows[0]) : [] },
            rowCount: totalRows,
            latencyMs,
          }).catch(() => {});
        }

        // Sprint 3.C — fire-and-forget use_count increment for sql_catalog match.
        if (ctx.clientId) {
          const sqlHash = canonicalSqlHash(query);
          void incrementCatalogUse({ sqlHash, clientId: ctx.clientId }).catch(() => {});
        }

        return {
          success: true,
          rowCount: totalRows,
          returnedRows: truncatedRows.length,
          truncated: totalRows > truncatedRows.length || charTruncated,
          truncationNote: totalRows > truncatedRows.length
            ? `Retornadas ${truncatedRows.length} de ${totalRows} linhas. Use LIMIT ou filtros mais específicos para reduzir.`
            : undefined,
          data: truncatedRows,
        };
      } catch (err) {
        // Mensagem acionável em vez do erro cru do BQ: o modelo é quem lê isto
        // e precisa saber que deve estreitar a query, não repeti-la.
        if (isBytesBilledError(err)) {
          return { success: false, error: BYTES_CAP_TOOL_MESSAGE, query };
        }
        return {
          success: false,
          error: formatToolError(err),
          query,
        };
      }
    },
  });
}
