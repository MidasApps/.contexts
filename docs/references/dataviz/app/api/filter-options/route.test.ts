import { describe, it, expect } from 'vitest';
import { matchClientDataset } from './match-client-dataset';

const bindingClient = {
  productBindings: [
    { productId: 'covenants', datasets: [{ dataSourceId: 'bq-data-wh', datasetId: 'vila_rosa_covenants' }] },
  ],
};

describe('matchClientDataset', () => {
  it('casa dataset no formato dataSourceId.datasetId de productBindings', () => {
    expect(matchClientDataset(bindingClient, 'bq-data-wh.vila_rosa_covenants')).toBe(true);
  });
  it('casa datasetId puro de productBindings', () => {
    expect(matchClientDataset(bindingClient, 'vila_rosa_covenants')).toBe(true);
  });
  it('segue casando campos legados', () => {
    expect(matchClientDataset({ dataset: 'bq-data-wh.om_monitor' }, 'bq-data-wh.om_monitor')).toBe(true);
    expect(matchClientDataset({ datasets: [{ dataset: 'x.y' }] }, 'x.y')).toBe(true);
  });
  it('não casa dataset alheio', () => {
    expect(matchClientDataset(bindingClient, 'bq-data-wh.galli_vivapark_covenants')).toBe(false);
  });
});
