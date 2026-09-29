import { describe, it, expect } from 'vitest';
import {
  flattenLegacyBinding,
  unflattenBinding,
  resolveSchemaBindings,
} from '../flatten-binding';

describe('flattenLegacyBinding', () => {
  it('converte nested → flat', () => {
    const legacy = {
      contratos: {
        saldo_devedor: 'vl_saldo_dev',
        rating: 'rating_liquid',
      },
      pagamentos: {
        valor_pago: 'vl_pago',
      },
    };
    expect(flattenLegacyBinding(legacy)).toEqual({
      'contratos.saldo_devedor': 'vl_saldo_dev',
      'contratos.rating': 'rating_liquid',
      'pagamentos.valor_pago': 'vl_pago',
    });
  });

  it('preserva null (campo indisponível)', () => {
    const legacy = {
      contratos: {
        saldo_devedor: 'vl_saldo_dev',
        data_vencimento: null,
      },
    };
    const flat = flattenLegacyBinding(legacy);
    expect(flat['contratos.data_vencimento']).toBeNull();
    expect(flat['contratos.saldo_devedor']).toBe('vl_saldo_dev');
  });

  it('retorna {} para input null/undefined', () => {
    expect(flattenLegacyBinding(null)).toEqual({});
    expect(flattenLegacyBinding(undefined)).toEqual({});
  });

  it('ignora tabelas vazias sem gerar chaves no flat', () => {
    const legacy = {
      contratos: {},
      pagamentos: { valor_pago: 'vl_pago' },
    };
    const flat = flattenLegacyBinding(legacy);
    expect(Object.keys(flat)).toEqual(['pagamentos.valor_pago']);
  });
});

describe('unflattenBinding', () => {
  it('converte flat → nested', () => {
    const flat = {
      'contratos.saldo_devedor': 'vl_saldo_dev',
      'contratos.rating': 'rating_liquid',
      'pagamentos.valor_pago': 'vl_pago',
    };
    expect(unflattenBinding(flat)).toEqual({
      contratos: {
        saldo_devedor: 'vl_saldo_dev',
        rating: 'rating_liquid',
      },
      pagamentos: {
        valor_pago: 'vl_pago',
      },
    });
  });

  it('preserva null', () => {
    const nested = unflattenBinding({
      'contratos.data_vencimento': null,
    });
    expect(nested.contratos.data_vencimento).toBeNull();
  });

  it('retorna {} para input null/undefined', () => {
    expect(unflattenBinding(null)).toEqual({});
    expect(unflattenBinding(undefined)).toEqual({});
  });

  it('descarta chaves sem ponto separador', () => {
    const nested = unflattenBinding({
      'saldo_devedor': 'vl_saldo_dev',
      'contratos.rating': 'rating_liquid',
    });
    expect(nested).toEqual({ contratos: { rating: 'rating_liquid' } });
  });
});

describe('roundtrip (idempotência)', () => {
  it('flatten → unflatten preserva conteúdo', () => {
    const legacy = {
      contratos: { saldo_devedor: 'vl_saldo_dev', data_vcto: null },
      pagamentos: { valor_pago: 'vl_pago' },
    };
    const roundtrip = unflattenBinding(flattenLegacyBinding(legacy));
    expect(roundtrip).toEqual(legacy);
  });

  it('unflatten → flatten preserva conteúdo', () => {
    const flat = {
      'contratos.saldo_devedor': 'vl_saldo_dev',
      'contratos.data_vcto': null,
      'pagamentos.valor_pago': 'vl_pago',
    };
    const roundtrip = flattenLegacyBinding(unflattenBinding(flat));
    expect(roundtrip).toEqual(flat);
  });
});

describe('resolveSchemaBindings', () => {
  it('prefere schemaBindings se não-vazio', () => {
    const resolved = resolveSchemaBindings({
      schemaBindings: { 'contratos.saldo_devedor': 'vl_saldo_dev' },
      schema: { contratos: { saldo_devedor: 'OUTRA_COLUNA' } },
    });
    expect(resolved).toEqual({ 'contratos.saldo_devedor': 'vl_saldo_dev' });
  });

  it('cai para schema legado quando schemaBindings é vazio', () => {
    const resolved = resolveSchemaBindings({
      schemaBindings: {},
      schema: { contratos: { saldo_devedor: 'vl_saldo_dev' } },
    });
    expect(resolved).toEqual({ 'contratos.saldo_devedor': 'vl_saldo_dev' });
  });

  it('cai para schema legado quando schemaBindings é null/undefined', () => {
    expect(
      resolveSchemaBindings({
        schema: { contratos: { saldo_devedor: 'vl_saldo_dev' } },
      }),
    ).toEqual({ 'contratos.saldo_devedor': 'vl_saldo_dev' });
  });

  it('retorna {} quando ambos são vazios/ausentes', () => {
    expect(resolveSchemaBindings({})).toEqual({});
    expect(resolveSchemaBindings({ schemaBindings: {}, schema: {} })).toEqual({});
  });
});

describe('resolveSchemaBindings — formato declarado vs adivinhado (R19)', () => {
  const legacy = { contratos: { saldo: 'saldo_devedor' } };

  it('sem schemaVersion mantém a heurística: novo vazio cai no legado', () => {
    expect(resolveSchemaBindings({ schemaBindings: {}, schema: legacy }))
      .toEqual({ 'contratos.saldo': 'saldo_devedor' });
  });

  // O caso em que a heurística MENTE: o administrador removeu todos os
  // mapeamentos, e "vazio ⇒ usa o legado" ressuscita colunas que ele acabou de
  // tirar. Com a versão declarada, vazio significa vazio.
  it('com schemaVersion 2, binding vazio é vazio — não ressuscita o legado', () => {
    expect(resolveSchemaBindings({ schemaBindings: {}, schema: legacy, schemaVersion: 2 }))
      .toEqual({});
  });

  it('com schemaVersion 2 ignora o legado mesmo com binding preenchido', () => {
    expect(resolveSchemaBindings({
      schemaBindings: { 'contratos.saldo': 'nova_coluna' },
      schema: legacy,
      schemaVersion: 2,
    })).toEqual({ 'contratos.saldo': 'nova_coluna' });
  });

  it('schemaVersion 1 (documento antigo) continua na heurística', () => {
    expect(resolveSchemaBindings({ schemaBindings: {}, schema: legacy, schemaVersion: 1 }))
      .toEqual({ 'contratos.saldo': 'saldo_devedor' });
  });
});
