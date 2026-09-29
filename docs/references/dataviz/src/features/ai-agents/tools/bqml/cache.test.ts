import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({ query: queryMock }),
}));

describe('computeModelHash', () => {
  it('is deterministic and sensitive to each component', async () => {
    const { computeModelHash } = await import('./cache');
    const base = {
      clientId: 'om',
      intent: 'forecast',
      featuresCanonical: 'a|b|c',
      target: 'pdd',
      safraWindowEnd: '2026-04-01',
      sourceColumnsDdlHash: 'abc',
    };
    const h1 = computeModelHash(base);
    const h2 = computeModelHash(base);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{40}$/);
    expect(computeModelHash({ ...base, target: 'other' })).not.toBe(h1);
    expect(computeModelHash({ ...base, sourceColumnsDdlHash: 'xyz' })).not.toBe(h1);
    expect(computeModelHash({ ...base, clientId: 'brz' })).not.toBe(h1);
  });
});

describe('lookupCachedModel', () => {
  beforeEach(() => queryMock.mockReset());

  it('returns entry when hash + clientId match', async () => {
    queryMock.mockResolvedValueOnce([
      [
        {
          hash: 'h',
          client_id: 'om',
          model_ref: 'dataviz_bqml_om.bqml_x',
          intent: 'forecast',
          model_type: 'ARIMA_PLUS',
          features_canonical: 'a|b',
          target: 'pdd',
          safra_window_end: '2026-04-01',
          source_columns_ddl_hash: 'abc',
        },
      ],
    ]);
    const { lookupCachedModel } = await import('./cache');
    const out = await lookupCachedModel('h', 'om');
    expect(out).toBeDefined();
    expect(out!.modelRef).toBe('dataviz_bqml_om.bqml_x');
  });

  it('returns null on cross-tenant (clientId mismatch)', async () => {
    queryMock.mockResolvedValueOnce([[]]);
    const { lookupCachedModel } = await import('./cache');
    const out = await lookupCachedModel('h', 'om');
    expect(out).toBeNull();
    const params = (queryMock.mock.calls[0]![0] as { params: Record<string, unknown> }).params;
    expect(params.client_id).toBe('om');
  });
});

describe('recordModelInRegistry', () => {
  beforeEach(() => queryMock.mockReset());

  it('inserts row with NOW()', async () => {
    queryMock.mockResolvedValueOnce([[]]);
    const { recordModelInRegistry } = await import('./cache');
    await recordModelInRegistry({
      hash: 'h',
      clientId: 'om',
      intent: 'forecast',
      modelType: 'ARIMA_PLUS',
      modelRef: 'dataviz_bqml_om.bqml_x',
      featuresCanonical: 'a|b',
      target: 'pdd',
      safraWindowEnd: '2026-04-01',
      sourceColumnsDdlHash: 'abc',
      trainBytes: 1000,
      trainCostUsd: 0.01,
      metricsJson: { rmse: 0.1 },
    });
    expect(queryMock).toHaveBeenCalledOnce();
    const sql = (queryMock.mock.calls[0]![0] as { query: string }).query;
    expect(sql).toMatch(/INSERT INTO/);
    expect(sql).toMatch(/bqml_model_registry/);
  });
});

describe('bumpUsage', () => {
  beforeEach(() => queryMock.mockReset());

  it('updates last_used_at and use_count filtered by (hash, client_id)', async () => {
    queryMock.mockResolvedValueOnce([[]]);
    const { bumpUsage } = await import('./cache');
    await bumpUsage('h', 'om');
    const sql = (queryMock.mock.calls[0]![0] as { query: string }).query;
    expect(sql).toMatch(/UPDATE/);
    expect(sql).toMatch(/last_used_at/);
    expect(sql).toMatch(/use_count = use_count \+ 1/);
    expect(sql).toMatch(/hash = @hash AND client_id = @client_id/);
  });
});

// rules/cost.md: todo caminho que executa SQL passa `maximumBytesBilled`.
describe('registry — teto de bytes em todo job', () => {
  beforeEach(() => queryMock.mockReset().mockResolvedValue([[]]));

  it('lookup, insert e bump passam maximumBytesBilled', async () => {
    const { lookupCachedModel, recordModelInRegistry, bumpUsage } = await import('./cache');
    const { maxBytesBilled } = await import('@/shared/lib/bigquery/cost-guard');
    await lookupCachedModel('h', 'vila-rosa');
    await recordModelInRegistry({
      hash: 'h', clientId: 'vila-rosa', intent: 'forecast', modelType: 'ARIMA_PLUS',
      modelRef: 'dataviz_bqml_vila_rosa.bqml_x', featuresCanonical: 'a', target: null,
      safraWindowEnd: null, sourceColumnsDdlHash: 'c',
    });
    await bumpUsage('h', 'vila-rosa');
    expect(queryMock).toHaveBeenCalledTimes(3);
    for (const [opts] of queryMock.mock.calls) {
      expect((opts as { maximumBytesBilled?: string }).maximumBytesBilled).toBe(String(maxBytesBilled()));
    }
  });
});
