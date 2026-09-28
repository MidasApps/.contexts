import { safeColumn } from '@/features/ai-agents/tools/bqml-utils';

export interface ClassificationDdlOpts {
  kind: 'logistic_reg' | 'boosted_tree_classifier';
  dataset: string;
  modelName: string;
  target: string;
  features: string[];
  sourceQuery: string;
}

function colString(name: string): string {
  return `'${safeColumn(name)}'`;
}

export function buildClassificationDdl(opts: ClassificationDdlOpts): string {
  const targetStr = colString(opts.target);
  // Validate features (presence-checked even when not used in DDL options to enforce safety upfront)
  opts.features.forEach((f) => safeColumn(f));

  if (opts.kind === 'logistic_reg') {
    return `CREATE OR REPLACE MODEL \`${opts.dataset}.${opts.modelName}\`
OPTIONS (
  MODEL_TYPE='LOGISTIC_REG',
  INPUT_LABEL_COLS=[${targetStr}],
  AUTO_CLASS_WEIGHTS=TRUE
) AS ${opts.sourceQuery};`;
  }
  return `CREATE OR REPLACE MODEL \`${opts.dataset}.${opts.modelName}\`
OPTIONS (
  MODEL_TYPE='BOOSTED_TREE_CLASSIFIER',
  INPUT_LABEL_COLS=[${targetStr}],
  MAX_ITERATIONS=50,
  EARLY_STOP=TRUE
) AS ${opts.sourceQuery};`;
}
