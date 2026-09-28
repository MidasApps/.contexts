import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { resolveTenantModelRef } from './multi-tenancy';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { logBqmlInvocation } from './invocation-logger';

const InputSchema = z.object({
  modelRef: z.string().min(1),
  horizon: z.number().int().positive().max(48),
  confidenceLevel: z.number().min(0.5).max(0.99).default(0.9),
}).strict();

export function createBqmlForecastTool(ctx: {
  clientId: string;
  sessionId: string;
  agentId: string;
}) {
  return tool({
    description:
      'Wrapper para ML.FORECAST sobre modelo ARIMA_PLUS já criado. Retorna previsões com intervalos de confiança.',
    inputSchema: InputSchema,
    execute: async (input) => {
      const t0 = Date.now();
      // Ref recomposto das partes validadas — o texto do modelo nunca vai ao SQL.
      const model = resolveTenantModelRef(ctx.clientId, input.modelRef);
      const sql = `SELECT * FROM ML.FORECAST(MODEL ${model}, STRUCT(${input.horizon} AS horizon, ${input.confidenceLevel} AS confidence_level))`;
      try {
        const [rows] = await getBigQueryClient().query({
          query: sql,
          useLegacySql: false,
          maximumBytesBilled: String(maxBytesBilled()),
        });
        Promise.resolve(
          logBqmlInvocation({
            clientId: ctx.clientId,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
            toolName: 'bqml.forecast',
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
            toolName: 'bqml.forecast',
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
