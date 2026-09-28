import { describe, it, expect } from 'vitest';
import { sanitizeWorkingMemory } from './pii-guard';

describe('sanitizeWorkingMemory', () => {
  it('replaces literal CPFs with redacted markers', () => {
    const out = sanitizeWorkingMemory({ note: 'CPF 123.456.789-09 cliente' });
    expect(out.note).toContain('[CPF_REDACTED]');
  });

  it('preserves filter type and replaces value with hash', () => {
    const out = sanitizeWorkingMemory({
      filters: [{ filter: 'cpf', value: '123.456.789-09' }],
    }) as { filters: Array<{ filter: string; valueHash?: string; value?: unknown }> };
    expect(out.filters[0].filter).toBe('cpf');
    expect(out.filters[0].valueHash).toMatch(/^[a-f0-9]{12}$/);
    expect(out.filters[0].value).toBeUndefined();
  });

  it('idempotent: sanitize(sanitize(x)) === sanitize(x)', () => {
    const input = {
      note: 'CPF 12345678909',
      filters: [{ filter: 'cpf', value: '111.222.333-44' }],
    };
    const a = sanitizeWorkingMemory(input);
    const b = sanitizeWorkingMemory(a);
    expect(b).toEqual(a);
  });

  it('preserves non-PII content', () => {
    const out = sanitizeWorkingMemory({ ltv: 0.72, msg: 'KPI atualizado' });
    expect(out).toEqual({ ltv: 0.72, msg: 'KPI atualizado' });
  });
});
