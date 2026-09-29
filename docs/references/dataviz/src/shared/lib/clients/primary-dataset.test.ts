import { describe, expect, it } from 'vitest';
import { primaryDatasetOf } from './primary-dataset';

describe('primaryDatasetOf', () => {
  it('prefers the legacy datasets list', () => {
    expect(primaryDatasetOf({ datasets: [{ dataset: 'a' }] as never, dataset: 'b' })).toBe('a');
  });

  it('falls back to the legacy single dataset', () => {
    expect(primaryDatasetOf({ dataset: 'b' })).toBe('b');
  });

  it('joins dataSourceId and datasetId of the first binding', () => {
    const productBindings = [{ datasets: [{ dataSourceId: 'proj', datasetId: 'vila_rosa_monitor' }] }] as never;
    expect(primaryDatasetOf({ productBindings })).toBe('proj.vila_rosa_monitor');
  });

  it('returns null when the client has no dataset', () => {
    expect(primaryDatasetOf({})).toBeNull();
  });
});
