import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { resolveTenantModelRef } from './multi-tenancy';
import { checkTenantQuery, tenantDefaultDataset } from '@/features/ai-agents/lib/tenant-query';
import { lazyClientQueryScope } from '@/features/ai-agents/lib/client-query-scope';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { logBqmlInvocation } from './invocation-logger';

const InputSchema = z.object({
  modelRef: z.string().min(1),
  inputQuery: z.string().min(1).describe(
    'Um único SELECT (ou WITH) sobre as tabelas do cliente, sem nome de dataset (ex.: FROM contratos).',
  ),
}).strict();

export function createBqmlPredictTool(ctx: {
  clientId: string;
  /** Dataset de dados do tenant, já autorizado pela rota (ADR-0006). Escopo do `inputQuery`. */
  dataset: string;
  sessionId: string;
  agentId: string;
}) {
  // Datasets vinculados ao cliente, lidos do Firestore no servidor (ADR-0006).
  const scopeOf = lazyClientQueryScope({ clientId: ctx.clientId, dataset: ctx.dataset });
  return tool({
    description:
      'Wrapper para ML.PREDICT. inputQuery é um único SELECT sobre as tabelas do cliente; DML, DDL, '
      + 'scripting e tabelas de outro dataset são recusados.',
    inputSchema: InputSchema,
    execute: async (input) => {
      const t0 = Date.now();
      // Ref recomposto das partes validadas — o texto do modelo nunca vai ao SQL.
      const model = resolveTenantModelRef(ctx.clientId, input.modelRef);
      // "Validado pelo caller" era só uma frase na descrição: nada impedia o
      // `inputQuery` de fechar o parêntese e emendar outro comando.
      const check = await checkTenantQuery(input.inputQuery, scopeOf);
      if (!check.ok) {
        Promise.resolve(
          logBqmlInvocation({
            clientId: ctx.clientId,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
            toolName: 'bqml.predict',
            modelRef: input.modelRef,
            durationMs: Date.now() - t0,
            success: false,
            error: `${check.code}: ${check.error}`,
          }),
        ).catch(() => {});
        return { success: false as const, code: check.code, error: check.error };
      }
      // Quebra de linha: um `--` no fim da query não engole o `))`.
      const sql = `SELECT * FROM ML.PREDICT(MODEL ${model}, (\n${check.sql}\n))`;
      try {
        const [rows] = await getBigQueryClient().query({
          query: sql,
          useLegacySql: false,
          defaultDataset: tenantDefaultDataset(ctx.dataset),
          maximumBytesBilled: String(maxBytesBilled()),
        });
        Promise.resolve(
          logBqmlInvocation({
            clientId: ctx.clientId,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
            toolName: 'bqml.predict',
            modelRef: input.modelRef,
            durationMs: Date.now() - t0,
            success: true,
          }),
        ).catch(() => {});
        return { rows, rowCount: (rows as unknown[]).length };
      } catch (err) {
        Promise.resolve(
          logBqmlInvocation({
            clientId: ctx.clientId,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
            toolName: 'bqml.predict',
            modelRef: input.modelRef,
            durationMs: Date.now() - t0,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        ).catch(() => {});
        // A mensagem do BigQuery traz id de projeto e service account; o modelo
        // recebe a versão redigida, o log acima fica com a crua.
        throw new Error(formatToolError(err));
      }
    },
  });
}
