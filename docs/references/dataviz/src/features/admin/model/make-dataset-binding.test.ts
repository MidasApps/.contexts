import { describe, it, expect } from 'vitest';
import { makeDatasetBinding } from './make-dataset-binding';

/**
 * G2 — um dataset binding novo deve nascer com o contractRef do PRODUTO
 * (contrato real), nunca o literal `'canonical'` que travava a resolução.
 */
describe('makeDatasetBinding', () => {
  it('usa o contractRef informado (do produto) — nunca "canonical"', () => {
    const b = makeDatasetBinding({ dataSourceId: 'ds1', contractRef: 'liquid-play' });
    expect(b.contractRef).toBe('liquid-play');
    expect(b.id).toBe('main');
    expect(b.isPrimary).toBe(true);
    expect(b.dataSourceId).toBe('ds1');
    expect(b.schemaBindings).toEqual({});
  });

  it('gera id secundário e isPrimary=false para index>0', () => {
    const b = makeDatasetBinding({ contractRef: 'liquid-play-plus', index: 1 });
    expect(b.id).toBe('secondary-1');
    expect(b.isPrimary).toBe(false);
    expect(b.contractRef).toBe('liquid-play-plus');
  });

  it('contractRef vazio quando o produto não tem contrato (não fabrica "canonical")', () => {
    const b = makeDatasetBinding({ contractRef: '' });
    expect(b.contractRef).toBe('');
  });
});
