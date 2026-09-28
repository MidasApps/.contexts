import { describe, it, expect } from 'vitest';
import { generateUniqueMetricId } from './metric-id';

function db(existing: Set<string>) {
  return {
    collection: () => ({
      doc: (id: string) => ({ get: async () => ({ exists: existing.has(id) }) }),
    }),
  } as unknown as FirebaseFirestore.Firestore;
}

describe('generateUniqueMetricId', () => {
  it('retorna domain.slug quando livre', async () => {
    expect(await generateUniqueMetricId(db(new Set()), 'carteira', 'meu_kpi')).toBe('carteira.meu_kpi');
  });
  it('sufixa _2 quando o base já existe', async () => {
    expect(await generateUniqueMetricId(db(new Set(['carteira.meu_kpi'])), 'carteira', 'meu_kpi')).toBe(
      'carteira.meu_kpi_2',
    );
  });
  it('sufixa _3 quando base e _2 existem', async () => {
    const taken = new Set(['carteira.meu_kpi', 'carteira.meu_kpi_2']);
    expect(await generateUniqueMetricId(db(taken), 'carteira', 'meu_kpi')).toBe('carteira.meu_kpi_3');
  });
});
