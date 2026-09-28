import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { resolveTenantModelRef } from './multi-tenancy';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { logBqmlInvocation } from './invocation-logger';

const InputSchema = z.object({
  modelRef: z.string().min(1),
  anomalyProbThreshold: z.number().min(0).max(1).default(0.95),
}).strict();

export function createBqmlDetectAnomaliesTool(ctx: {
  clientId: string;
  sessionId: string;
  agentId: string;
}) {
  return tool({
    description:
      'Wrapper para ML.DETECT_ANOMALIES sobre modelo BQML (ARIMA_PLUS ou AUTOENCODER). Retorna linhas com is_anomaly e probabilidade.',
    inputSchema: InputSchema,
    execute: async (input) => {
      const t0 = Date.now();
      // Ref recomposto das partes validadas — o texto do modelo nunca vai ao SQL.
      const model = resolveTenantModelRef(ctx.clientId, input.modelRef);
      const sql = `SELECT * FROM ML.DETECT_ANOMALIES(MODEL ${model}, STRUCT(${input.anomalyProbThreshold} AS anomaly_prob_threshold))`;
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
            toolName: 'bqml.detect_anomalies',
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
            toolName: 'bqml.detect_anomalies',
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
