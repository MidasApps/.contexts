import { describe, it, expect } from 'vitest';

describe('suggestModel decision tree', () => {
  it('forecast time series → ARIMA_PLUS', async () => {
    const { decideModelType } = await import('./suggest-model');
    const out = decideModelType({
      intent: 'forecast',
      target: 'pdd_pct',
      timeColumn: 'data_safra',
      knownFeatures: ['ltv', 'prazo'],
      rowCount: 50_000,
    });
    expect(out.modelType).toBe('ARIMA_PLUS');
  });

  it('clustering → KMEANS', async () => {
    const { decideModelType } = await import('./suggest-model');
    const out = decideModelType({
      intent: 'clustering',
      target: null,
      timeColumn: null,
      knownFeatures: ['ltv', 'prazo', 'taxa', 'score'],
      rowCount: 100_000,
    });
    expect(out.modelType).toBe('KMEANS');
  });

  it('classification small data → LOGISTIC_REG', async () => {
    const { decideModelType } = await import('./suggest-model');
    const out = decideModelType({
      intent: 'classification',
      target: 'default_flag',
      timeColumn: null,
      knownFeatures: ['ltv', 'score'],
      rowCount: 800_000,
    });
    expect(out.modelType).toBe('LOGISTIC_REG');
  });

  it('classification big data → BOOSTED_TREE_CLASSIFIER', async () => {
    const { decideModelType } = await import('./suggest-model');
    const out = decideModelType({
      intent: 'classification',
      target: 'default_flag',
      timeColumn: null,
      knownFeatures: ['ltv', 'score'],
      rowCount: 12_000_000,
    });
    expect(out.modelType).toBe('BOOSTED_TREE_CLASSIFIER');
  });

  it('anomaly time series → ARIMA_PLUS detection', async () => {
    const { decideModelType } = await import('./suggest-model');
    const out = decideModelType({
      intent: 'anomaly',
      target: 'pdd_pct',
      timeColumn: 'data_base',
      knownFeatures: [],
      rowCount: 60_000,
    });
    expect(out.modelType).toBe('ARIMA_PLUS');
  });
});

describe('estimateCost', () => {
  it('estimates ARIMA_PLUS cost at $250/TB', async () => {
    const { estimateCost } = await import('./suggest-model');
    const out = estimateCost({
      rowCount: 1_000_000,
      rowWidthBytes: 200,
      modelType: 'ARIMA_PLUS',
    });
    expect(out.bytes).toBeGreaterThan(0);
    expect(out.costUsd).toBeGreaterThan(0);
  });
});
