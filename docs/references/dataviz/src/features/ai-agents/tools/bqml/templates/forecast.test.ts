import { describe, it, expect } from 'vitest';
import { buildForecastDdl } from './forecast';

describe('buildForecastDdl', () => {
  it('emits ARIMA_PLUS DDL with TIME_SERIES_* options', () => {
    const ddl = buildForecastDdl({
      kind: 'arima_plus',
      dataset: 'dataviz_bqml_om',
      modelName: 'bqml_forecast_pdd',
      target: 'pdd_liquid',
      timeColumn: 'pdd_liquid',
      horizon: 12,
      sourceQuery: 'SELECT * FROM t',
    });
    expect(ddl).toMatch(/MODEL_TYPE='ARIMA_PLUS'/);
    expect(ddl).toMatch(/TIME_SERIES_DATA_COL='pdd_liquid'/);
    expect(ddl).toMatch(/HORIZON=12/);
    expect(ddl).toMatch(/HOLIDAY_REGION='BR'/);
  });

  it('rejects unsafe column input', () => {
    expect(() =>
      buildForecastDdl({
        kind: 'arima_plus',
        dataset: 'dataviz_bqml_om',
        modelName: 'bqml_x',
        target: 'foo;DROP',
        timeColumn: 'pdd_liquid',
        horizon: 6,
        sourceQuery: 'SELECT * FROM t',
      }),
    ).toThrow();
  });
});
