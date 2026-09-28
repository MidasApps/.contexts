import { describe, it, expect } from 'vitest';
import { collectBindingGaps } from './coverage';
import type { ClientDatasetBinding } from '@/shared/schemas/client-binding';

function binding(map: Record<string, string | null>): ClientDatasetBinding {
  return {
    id: 'b',
    dataSourceId: 'ds',
    datasetId: 'd',
    contractRef: 'liquid-play',
    schemaBindings: map,
    schema: {},
    isPrimary: true,
  } as unknown as ClientDatasetBinding;
}

const requires = [
  'liquid-play.contratos.saldo_devedor',
  'liquid-play.contratos.dias_atraso',
];

describe('collectBindingGaps', () => {
  it('aponta attribute sem mapping (cliente migrado)', () => {
    const gaps = collectBindingGaps(
      requires,
      binding({ 'contratos.saldo_devedor': 'saldo' }), // falta dias_atraso
      'liquid-play',
    );
    expect(gaps).toEqual([{ ref: 'liquid-play.contratos.dias_atraso', reason: 'sem-mapping' }]);
  });

  it('aponta attribute marcado como indisponível (null)', () => {
    const gaps = collectBindingGaps(
      requires,
      binding({ 'contratos.saldo_devedor': 'saldo', 'contratos.dias_atraso': null }),
      'liquid-play',
    );
    expect(gaps).toEqual([{ ref: 'liquid-play.contratos.dias_atraso', reason: 'desabilitado' }]);
  });

  it('sem lacunas quando tudo mapeado', () => {
    const gaps = collectBindingGaps(
      requires,
      binding({ 'contratos.saldo_devedor': 'saldo', 'contratos.dias_atraso': 'atraso' }),
      'liquid-play',
    );
    expect(gaps).toEqual([]);
  });

  it('cliente legado (schemaBindings vazio) ⇒ sem lacunas (back-compat)', () => {
    const gaps = collectBindingGaps(requires, binding({}), 'liquid-play');
    expect(gaps).toEqual([]);
  });

  it('ignora refs de outro contrato', () => {
    const gaps = collectBindingGaps(
      ['outro.x.y', 'liquid-play.contratos.saldo_devedor'],
      binding({ 'contratos.saldo_devedor': 'saldo' }),
      'liquid-play',
    );
    expect(gaps).toEqual([]);
  });
});
