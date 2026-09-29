import { describe, it, expect } from 'vitest';
import { AmbientFilter } from '../ambient-filter';

describe('AmbientFilter', () => {
  it('parseia op:in', () => {
    const r = AmbientFilter.parse({ op: 'in', attribute: 'contratos.rating_liquid', values: ['A', 'B'] });
    expect(r.op).toBe('in');
  });

  it('parseia op:numeric_buckets (eq, intervalo, aberto)', () => {
    const r = AmbientFilter.parse({
      op: 'numeric_buckets',
      attribute: 'contratos.dias_atraso',
      buckets: [{ eq: 0 }, { min: 1, max: 30 }, { min: 181 }],
    });
    expect(r.op).toBe('numeric_buckets');
    if (r.op === 'numeric_buckets') expect(r.buckets).toHaveLength(3);
  });

  it('rejeita op desconhecido', () => {
    expect(() => AmbientFilter.parse({ op: 'xx', attribute: 'a', values: [] })).toThrow();
  });
});
