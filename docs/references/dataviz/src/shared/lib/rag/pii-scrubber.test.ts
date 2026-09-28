import { describe, it, expect } from 'vitest';
import { scrubPii, scrubObject, hashId } from './pii-scrubber';

describe('scrubPii', () => {
  it('masks CPF (###.###.###-##)', () => {
    expect(scrubPii('CPF 123.456.789-09 do mutuário')).toBe('CPF [CPF_REDACTED] do mutuário');
  });

  it('masks CPF without separators (11 digits standalone)', () => {
    expect(scrubPii('id 12345678909 fim')).toBe('id [CPF_REDACTED] fim');
  });

  it('masks CNPJ', () => {
    expect(scrubPii('CNPJ 12.345.678/0001-90')).toBe('CNPJ [CNPJ_REDACTED]');
  });

  it('masks emails', () => {
    expect(scrubPii('contato user@dominio.com.br aqui')).toBe('contato [EMAIL_REDACTED] aqui');
  });

  it('preserves non-PII numeric content', () => {
    expect(scrubPii('o LTV foi 75% em 2025')).toBe('o LTV foi 75% em 2025');
  });

  it('chains multiple PII items', () => {
    const out = scrubPii('a@b.com 123.456.789-09 e 12.345.678/0001-90');
    expect(out).toBe('[EMAIL_REDACTED] [CPF_REDACTED] e [CNPJ_REDACTED]');
  });
});

describe('scrubObject', () => {
  it('deeply scrubs string values in nested objects/arrays', () => {
    const input = {
      user: { email: 'a@b.com', name: 'Foo' },
      items: [{ doc: '123.456.789-00' }, { x: 42 }],
      raw: 'CPF 12345678900',
    };
    const out = scrubObject(input);
    expect(out.user.email).toBe('[EMAIL_REDACTED]');
    expect(out.user.name).toBe('Foo');
    expect(out.items[0].doc).toBe('[CPF_REDACTED]');
    expect(out.items[1].x).toBe(42);
    expect(out.raw).toBe('CPF [CPF_REDACTED]');
  });

  it('preserves non-string types unchanged', () => {
    const out = scrubObject({ n: 1, b: true, d: new Date('2026-01-01'), nil: null });
    expect(out.n).toBe(1);
    expect(out.b).toBe(true);
    expect(out.nil).toBeNull();
  });
});

describe('hashId', () => {
  it('returns deterministic 12-char hex', () => {
    const h1 = hashId('user@example.com');
    const h2 = hashId('user@example.com');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{12}$/);
  });

  it('differs for different inputs', () => {
    expect(hashId('a')).not.toBe(hashId('b'));
  });
});
