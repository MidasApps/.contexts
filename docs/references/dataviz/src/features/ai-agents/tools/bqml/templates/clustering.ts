import { safeColumn } from '@/features/ai-agents/tools/bqml-utils';

export interface ClusteringDdlOpts {
  dataset: string;
  modelName: string;
  features: string[];
  sourceQuery: string;
  numClusters?: { min: number; max: number };
}

export function buildClusteringDdl(opts: ClusteringDdlOpts): string {
  const features = opts.features.map((f) => safeColumn(f));
  const range = opts.numClusters ?? { min: 2, max: 8 };
  return `CREATE OR REPLACE MODEL \`${opts.dataset}.${opts.modelName}\`
OPTIONS (
  MODEL_TYPE='KMEANS',
  NUM_CLUSTERS=HPARAM_RANGE(${range.min}, ${range.max}),
  KMEANS_INIT_METHOD='KMEANS++'
) AS SELECT ${features.join(', ')} FROM (${opts.sourceQuery});`;
}
