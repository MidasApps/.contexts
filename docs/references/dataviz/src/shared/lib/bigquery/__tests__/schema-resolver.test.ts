import { describe, it, expect } from 'vitest';
import {
  resolveColumnOrThrow,
  FieldUnavailableError,
} from '../schema-resolver';

describe('resolveColumnOrThrow', () => {
  it('lança FieldUnavailableError quando o campo é null-mapeado', () => {
    const schema = { contratos: { saldo_devedor: null } };
    expect(() => resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor'))
      .toThrow(FieldUnavailableError);
  });

  it('o erro nomeia table.field', () => {
    const schema = { contratos: { saldo_devedor: null } };
    try {
      resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor');
      expect.unreachable('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(FieldUnavailableError);
      expect((e as FieldUnavailableError).table).toBe('contratos');
      expect((e as FieldUnavailableError).field).toBe('saldo_devedor');
      expect((e as Error).message).toContain('contratos.saldo_devedor');
    }
  });

  it('retorna a coluna mapeada quando há mapping', () => {
    const schema = { contratos: { saldo_devedor: 'vl_saldo' } };
    expect(resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor')).toBe('vl_saldo');
  });

  it('retorna o canônico quando não há schema (OM/sem-schema)', () => {
    expect(resolveColumnOrThrow(null, 'contratos', 'saldo_devedor')).toBe('saldo_devedor');
  });

  it('retorna o canônico quando o campo não está no mapping', () => {
    const schema = { contratos: { outro: 'x' } };
    expect(resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor')).toBe('saldo_devedor');
  });
});
