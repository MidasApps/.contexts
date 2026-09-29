import { safeColumn } from '@/features/ai-agents/tools/bqml-utils';

export interface ForecastDdlOpts {
  kind: 'arima_plus' | 'boosted_tree_regressor';
  dataset: string; // ex: 'dataviz_bqml_vila_rosa'
  modelName: string; // ex: 'bqml_forecast_pdd'
  target: string;
  timeColumn: string;
  idColumn?: string;
  horizon: number;
  holidayRegion?: string;
  features?: string[];
  sourceQuery: string; // pre-validated by bq.dry_run_sql
}

/** Wraps a validated column name in single quotes for BQML OPTIONS string literals. */
function colString(name: string): string {
  return `'${safeColumn(name)}'`;
}

export function buildForecastDdl(opts: ForecastDdlOpts): string {
  const targetStr = colString(opts.target);
  const timeStr = colString(opts.timeColumn);
  const idStr = opts.idColumn ? colString(opts.idColumn) : 'NULL';
  const region = opts.holidayRegion ?? 'BR';

  if (opts.kind === 'arima_plus') {
    return `CREATE OR REPLACE MODEL \`${opts.dataset}.${opts.modelName}\`
OPTIONS (
  MODEL_TYPE='ARIMA_PLUS',
  TIME_SERIES_TIMESTAMP_COL=${timeStr},
  TIME_SERIES_DATA_COL=${targetStr},
  TIME_SERIES_ID_COL=${idStr},
  HORIZON=${opts.horizon},
  AUTO_ARIMA=TRUE,
  HOLIDAY_REGION='${region}'
) AS ${opts.sourceQuery};`;
  }

  const featureStrs = (opts.features ?? []).map((f) => colString(f));
  return `CREATE OR REPLACE MODEL \`${opts.dataset}.${opts.modelName}\`
OPTIONS (
  MODEL_TYPE='BOOSTED_TREE_REGRESSOR',
  INPUT_LABEL_COLS=[${targetStr}],
  MAX_ITERATIONS=50,
  EARLY_STOP=TRUE,
  FEATURES=[${featureStrs.join(', ')}]
) AS ${opts.sourceQuery};`;
}
