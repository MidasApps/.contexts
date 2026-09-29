import { describe, expect, it } from 'vitest';
import { listUnavailableFields } from './unavailable-fields';

describe('listUnavailableFields', () => {
  it('lists a field once per table that marks it unavailable, in document order', () => {
    const schema = {
      contratos: { projeto: null, data_base_report: 'dt_base' },
      pagamentos: { valor: 'vl_pago', projeto: null },
      fluxo_caixa: { projeto: null, saldo: null },
    };

    expect(listUnavailableFields(schema)).toEqual(['projeto', 'projeto', 'projeto', 'saldo']);
  });

  it('returns nothing when there is no legacy map', () => {
    expect(listUnavailableFields(undefined)).toEqual([]);
  });
});
