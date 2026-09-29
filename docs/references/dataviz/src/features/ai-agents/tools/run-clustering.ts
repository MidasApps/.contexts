import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { sessionModelRef, dropModel, trainModel, queryBQML, safeColumn, safeDate } from './bqml-utils';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import type { ToolContext } from './tool-context';
import { buildAndClause } from './tool-context';

export function createRunClusteringTool(ctx: ToolContext) {
  const { dataset } = ctx;
  return tool({
    description:
      'Segmenta contratos em clusters usando BigQuery ML K-Means. Retorna clusters com centroides e estatísticas. Fallback para NTILE/quartis se BQML não disponível.',
    inputSchema: z.object({
      features: z.array(z.string()).describe('Colunas para clustering (ex: ["ltv", "dias_atraso", "saldo_devedor"]).'),
      numClusters: z.number().int().min(2).max(10).default(4).describe('Número de clusters (2-10).'),
      limit: z.number().int().default(500).describe('Máximo de contratos a retornar por cluster.'),
    }),
    execute: async ({ features, numClusters, limit }) => {
      const safeCols = features.map(safeColumn);
      const colList = safeCols.join(', ');
      const model = sessionModelRef(dataset, `kmeans_${safeCols.join('_')}_k${numClusters}`, ctx.sessionId);

      // ---------- Try BQML K-Means ----------
      try {
        await trainModel(
          dataset,
          `CREATE OR REPLACE MODEL ${model}
           OPTIONS(
             model_type = 'KMEANS',
             num_clusters = ${numClusters},
             standardize_features = TRUE,
             max_iterations = 20
           ) AS
           SELECT ${colList}
           FROM \`${dataset}.contratos\`
           WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
             AND ${safeCols.map((c) => `${c} IS NOT NULL`).join(' AND ')} ${buildAndClause(ctx, { dateMode: 'none' })}`,
        );

        const [predictions, centroids] = await Promise.all([
          queryBQML(
            dataset,
            `SELECT
               p.CENTROID_ID AS cluster_id,
               c.id_contrato, c.nome_empreendimento, ${safeCols.map((col) => `c.${col}`).join(', ')}
             FROM ML.PREDICT(MODEL ${model}, (
               SELECT id_contrato, nome_empreendimento, ${colList}
               FROM \`${dataset}.contratos\`
               WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
                 AND ${safeCols.map((c) => `${c} IS NOT NULL`).join(' AND ')} ${buildAndClause(ctx, { dateMode: 'none' })}
             )) p
             JOIN \`${dataset}.contratos\` c
               ON c.id_contrato = p.id_contrato
               AND c.data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
             ORDER BY p.CENTROID_ID
             LIMIT ${limit}`,
          ),
          queryBQML(
            dataset,
            `SELECT centroid_id, feature, numerical_value
             FROM ML.CENTROIDS(MODEL ${model})
             ORDER BY centroid_id, feature`,
          ),
        ]);

        // Build cluster summaries
        const clusterStats: Record<number, { count: number; centroid: Record<string, number> }> = {};
        for (const row of predictions) {
          const cid = Number(row.cluster_id);
          if (!clusterStats[cid]) clusterStats[cid] = { count: 0, centroid: {} };
          clusterStats[cid].count++;
        }
        for (const row of centroids) {
          const cid = Number(row.centroid_id);
          if (!clusterStats[cid]) clusterStats[cid] = { count: 0, centroid: {} };
          clusterStats[cid].centroid[String(row.feature)] = Number(row.numerical_value);
        }

        return {
          success: true,
          method: 'BQML_KMEANS',
          features: safeCols,
          numClusters,
          clusterStats: Object.entries(clusterStats).map(([id, stats]) => ({
            cluster_id: Number(id),
            ...stats,
          })),
          predictions,
          model_info: { name: model, type: 'KMEANS' },
        };
      } catch (bqmlError) {
        await dropModel(dataset, model);
        // ---------- Fallback: NTILE quartis ----------
        try {
          const bq = getBigQueryClient();
          const { datasetId, projectId } = parseDatasetRef(dataset);
          const primaryFeature = safeCols[0];
          const [rows] = await bq.query({
            query: `
              SELECT
                NTILE(${numClusters}) OVER (ORDER BY ${primaryFeature}) AS cluster_id,
                id_contrato, nome_empreendimento, ${colList}
              FROM \`${dataset}.contratos\`
              WHERE data_base_report = '${safeDate(ctx.filters.dateRange.end)}'
                AND ${safeCols.map((c) => `${c} IS NOT NULL`).join(' AND ')} ${buildAndClause(ctx, { dateMode: 'none' })}
              ORDER BY cluster_id
              LIMIT ${limit}`,
            useLegacySql: false,
            defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
            jobTimeoutMs: 60_000,
            maximumBytesBilled: String(maxBytesBilled()),
          });

          return {
            success: true,
            method: 'NTILE_FALLBACK',
            features: safeCols,
            numClusters,
            predictions: rows,
            bqml_error: formatToolError(bqmlError),
          };
        } catch (err) {
          return { success: false, error: formatToolError(err) };
        }
      }
    },
  });
}
