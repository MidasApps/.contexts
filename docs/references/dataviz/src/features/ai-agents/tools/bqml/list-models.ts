import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import { deriveBqmlDataset } from './multi-tenancy';
import { formatToolError } from '@/features/ai-agents/lib/format-error';

/** O dataset BQML do cliente ainda não existe (404 do BigQuery). */
const isMissingDatasetError = (err: unknown): boolean => {
  const { code } = (err ?? {}) as { code?: unknown };
  const message = err instanceof Error ? err.message : String(err);
  return code === 404 && /Not found: Dataset/i.test(message);
};

interface CachedList {
  models: Array<{
    name: string;
    intent?: string;
    modelType?: string;
    createdAt?: string;
    lastUsedAt?: string | null;
  }>;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CachedList>();

export const __resetListCache = (): void => {
  cache.clear();
};

export const createBqmlListModelsTool = (ctx: { clientId: string }) => {
  return tool({
    description:
      'Lista os modelos BQML disponíveis no dataset do tenant atual. Cache 1h. Use antes de tentar criar um modelo novo (pode haver cache de modelo equivalente em dataviz_meta.bqml_model_registry).',
    inputSchema: z.object({}).strict(),
    execute: async () => {
      const dataset = deriveBqmlDataset(ctx.clientId);
      const now = Date.now();
      const cached = cache.get(dataset);
      if (cached && cached.expiresAt > now) {
        return { models: cached.models, cacheHit: true };
      }
      // Sem try/catch, o erro do BigQuery subia cru até o modelo — com o id do
      // projeto (`Not found: Dataset <projeto>:dataviz_bqml_<cliente>`).
      try {
        const client = getBigQueryClient();
        const [models] = await client.dataset(dataset).getModels();
        const projectId = process.env.BIGQUERY_PROJECT_ID ?? '';
        const expectedRefs = (models as Array<{ id?: string }>).map(
          (m) => `${dataset}.${m.id}`,
        );

        let registryRows: Array<{
          model_ref: string;
          intent?: string;
          model_type?: string;
          created_at?: { value?: string };
          last_used_at?: { value?: string } | null;
        }> = [];
        if (expectedRefs.length > 0) {
          const clientIdNormalized = dataset.replace('dataviz_bqml_', '');
          const [rows] = await client.query({
            query: `SELECT model_ref, intent, model_type, created_at, last_used_at
                    FROM \`${projectId}.dataviz_meta.bqml_model_registry\`
                    WHERE client_id = @client_id
                      AND model_ref IN UNNEST(@refs)`,
            params: { client_id: clientIdNormalized, refs: expectedRefs },
            useLegacySql: false,
            maximumBytesBilled: String(maxBytesBilled()),
          });
          registryRows = rows as never;
        }

        const byRef = new Map(registryRows.map((r) => [r.model_ref, r]));
        const out = (models as Array<{ id?: string }>).map((m) => {
          const id = m.id ?? '';
          const ref = `${dataset}.${id}`;
          const reg = byRef.get(ref);
          return {
            name: id,
            intent: reg?.intent,
            modelType: reg?.model_type,
            createdAt: reg?.created_at?.value,
            lastUsedAt: reg?.last_used_at?.value ?? null,
          };
        });
        cache.set(dataset, { models: out, expiresAt: now + TTL_MS });
        return { models: out, cacheHit: false };
      } catch (err) {
        // Cliente que nunca treinou modelo não tem o dataset: é lista vazia, não erro.
        if (isMissingDatasetError(err)) return { models: [], cacheHit: false };
        return { success: false, error: formatToolError(err), models: [] };
      }
    },
  });
};
