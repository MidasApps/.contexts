import { describe, it, expect } from 'vitest';
import { buildClassificationDdl } from './classification';

describe('buildClassificationDdl', () => {
  it('emits LOGISTIC_REG DDL with INPUT_LABEL_COLS', () => {
    const ddl = buildClassificationDdl({
      kind: 'logistic_reg',
      dataset: 'dataviz_bqml_om',
      modelName: 'bqml_logreg',
      target: 'pdd_liquid',
      features: ['ltv', 'dias_atraso'],
      sourceQuery: 'SELECT * FROM t',
    });
    expect(ddl).toMatch(/MODEL_TYPE='LOGISTIC_REG'/);
    expect(ddl).toMatch(/INPUT_LABEL_COLS=\['pdd_liquid'\]/);
    expect(ddl).toMatch(/AUTO_CLASS_WEIGHTS=TRUE/);
  });

  it('emits BOOSTED_TREE_CLASSIFIER DDL', () => {
    const ddl = buildClassificationDdl({
      kind: 'boosted_tree_classifier',
      dataset: 'dataviz_bqml_om',
      modelName: 'bqml_btc',
      target: 'pdd_liquid',
      features: ['ltv'],
      sourceQuery: 'SELECT * FROM t',
    });
    expect(ddl).toMatch(/MODEL_TYPE='BOOSTED_TREE_CLASSIFIER'/);
    expect(ddl).toMatch(/MAX_ITERATIONS=50/);
  });

  it('rejects unsafe column input', () => {
    expect(() =>
      buildClassificationDdl({
        kind: 'logistic_reg',
        dataset: 'dataviz_bqml_om',
        modelName: 'bqml_x',
        target: 'foo;DROP',
        features: ['ltv'],
        sourceQuery: 'SELECT * FROM t',
      }),
    ).toThrow();
  });
});
