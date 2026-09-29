import { describe, it, expect } from 'vitest';
import { checkPercentScale } from './percent-scale-guard';

const COLS = ['bucket', 'value'];

describe('checkPercentScale — métrica escrita pelo chat', () => {
  it('fração sem declaração passa, sem colunas em pontos', () => {
    expect(checkPercentScale({ sql: 'SELECT SAFE_DIVIDE(a, b) AS value', outputColumns: COLS, declared: [] }))
      .toEqual({ ok: true, percentPointColumns: [] });
  });

  it.each(['SELECT 100 * SAFE_DIVIDE(a, b) AS value', 'SELECT SAFE_DIVIDE(a, b)*100 AS value', 'SELECT 100.0*x AS value'])(
    'multiplicar por 100 sem declarar é recusado: %s',
    (sql) => {
      const check = checkPercentScale({ sql, outputColumns: COLS, declared: [] });
      expect(check.ok).toBe(false);
      expect(!check.ok && check.error).toMatch(/fração|FRAÇÃO/);
    },
  );

  it('multiplicar por 100 declarando a coluna passa', () => {
    expect(checkPercentScale({ sql: 'SELECT 100 * x AS value', outputColumns: COLS, declared: ['value'] }))
      .toEqual({ ok: true, percentPointColumns: ['value'] });
  });

  it('dividir por 100 e multiplicar por 1000 não contam como pontos', () => {
    expect(checkPercentScale({ sql: 'SELECT x / 100 AS value, 1000 * y AS z', outputColumns: COLS, declared: [] }).ok).toBe(true);
  });

  it('declarar coluna que a consulta não devolve é recusado', () => {
    const check = checkPercentScale({ sql: 'SELECT x AS value', outputColumns: COLS, declared: ['pct'] });
    expect(check.ok).toBe(false);
    expect(!check.ok && check.error).toMatch(/pct/);
  });

  it('declaração herdada é podada ao que o SQL novo devolve', () => {
    expect(checkPercentScale({ sql: 'SELECT x AS value', outputColumns: COLS, declared: ['pct', 'value'], inherited: true }))
      .toEqual({ ok: true, percentPointColumns: ['value'] });
  });

  it('herdada que sumiu inteira não esconde um × 100 novo', () => {
    expect(checkPercentScale({ sql: 'SELECT 100 * x AS value', outputColumns: COLS, declared: ['pct'], inherited: true }).ok).toBe(false);
  });
});
