import { safeColumn } from '@/features/ai-agents/tools/bqml-utils';

export interface AnomalyDdlOpts {
  kind: 'autoencoder' | 'arima_plus_anomaly';
  dataset: string;
  modelName: string;
  features?: string[];
  target?: string;
  timeColumn?: string;
  sourceQuery: string;
}

function colString(name: string): string {
  return `'${safeColumn(name)}'`;
}

export function buildAnomalyDdl(opts: AnomalyDdlOpts): string {
  if (opts.kind === 'autoencoder') {
    // Validate features upfront
    (opts.features ?? []).forEach((f) => safeColumn(f));
    return `CREATE OR REPLACE MODEL \`${opts.dataset}.${opts.modelName}\`
OPTIONS (
  MODEL_TYPE='AUTOENCODER',
  ACTIVATION_FN='RELU',
  HIDDEN_UNITS=[8, 4, 8]
) AS ${opts.sourceQuery};`;
  }
  const target = colString(opts.target ?? 'value');
  const time = colString(opts.timeColumn ?? 'ts');
  return `CREATE OR REPLACE MODEL \`${opts.dataset}.${opts.modelName}\`
OPTIONS (
  MODEL_TYPE='ARIMA_PLUS',
  TIME_SERIES_TIMESTAMP_COL=${time},
  TIME_SERIES_DATA_COL=${target},
  AUTO_ARIMA=TRUE
) AS ${opts.sourceQuery};`;
}
