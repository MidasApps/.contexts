import { describe, it, expect } from 'vitest';
import { buildClusteringDdl } from './clustering';

describe('buildClusteringDdl', () => {
  it('emits KMEANS DDL with HPARAM_RANGE', () => {
    const ddl = buildClusteringDdl({
      dataset: 'dataviz_bqml_om',
      modelName: 'bqml_kmeans',
      features: ['ltv', 'dias_atraso'],
      sourceQuery: 'SELECT ltv, dias_atraso FROM t',
    });
    expect(ddl).toMatch(/MODEL_TYPE='KMEANS'/);
    expect(ddl).toMatch(/NUM_CLUSTERS=HPARAM_RANGE\(2, 8\)/);
    expect(ddl).toMatch(/SELECT ltv, dias_atraso FROM/);
  });

  it('rejects unsafe column input', () => {
    expect(() =>
      buildClusteringDdl({
        dataset: 'dataviz_bqml_om',
        modelName: 'bqml_x',
        features: ['foo;DROP'],
        sourceQuery: 'SELECT * FROM t',
      }),
    ).toThrow();
  });
});
