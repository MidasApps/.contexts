import { describe, it, expect } from 'vitest';
import { buildAnomalyDdl } from './anomaly';

describe('buildAnomalyDdl', () => {
  it('emits AUTOENCODER DDL', () => {
    const ddl = buildAnomalyDdl({
      kind: 'autoencoder',
      dataset: 'dataviz_bqml_om',
      modelName: 'bqml_ae',
      features: ['ltv', 'dias_atraso'],
      sourceQuery: 'SELECT * FROM t',
    });
    expect(ddl).toMatch(/MODEL_TYPE='AUTOENCODER'/);
    expect(ddl).toMatch(/HIDDEN_UNITS=\[8, 4, 8\]/);
  });

  it('emits ARIMA_PLUS DDL for time-series anomaly detection', () => {
    const ddl = buildAnomalyDdl({
      kind: 'arima_plus_anomaly',
      dataset: 'dataviz_bqml_om',
      modelName: 'bqml_arima_anom',
      target: 'pdd_liquid',
      timeColumn: 'pdd_liquid',
      sourceQuery: 'SELECT * FROM t',
    });
    expect(ddl).toMatch(/MODEL_TYPE='ARIMA_PLUS'/);
    expect(ddl).toMatch(/TIME_SERIES_DATA_COL='pdd_liquid'/);
  });

  it('rejects unsafe column input', () => {
    expect(() =>
      buildAnomalyDdl({
        kind: 'autoencoder',
        dataset: 'dataviz_bqml_om',
        modelName: 'bqml_x',
        features: ['foo;DROP'],
        sourceQuery: 'SELECT * FROM t',
      }),
    ).toThrow();
  });
});
