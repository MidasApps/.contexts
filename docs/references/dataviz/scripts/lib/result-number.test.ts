import { describe, it, expect } from 'vitest';
import { resultNumber, sameValue } from './result-number';

/**
 * A validação de `add-kpi-sparklines.ts` é o único portão entre uma cirurgia
 * textual em SQL e uma curva gravada no catálogo (ADR-0027 §3). Estes testes
 * cobrem o buraco por onde ela deixava passar: ausência de valor.
 */
describe('resultNumber', () => {
  it('lê number, string e o objeto de NUMERIC do BigQuery', () => {
    expect(resultNumber(7)).toBe(7);
    expect(resultNumber('12.06')).toBe(12.06);
    expect(resultNumber({ value: '8.31' })).toBe(8.31);
  });

  /*
   * `Number(null)` é 0, não NaN — é o detalhe que reprovava sozinho a validação
   * inteira: um KPI sem valor virava zero e batia com uma série que terminava
   * em zero real.
   */
  it('ausência de valor é null, nunca zero', () => {
    expect(resultNumber(null)).toBeNull();
    expect(resultNumber(undefined)).toBeNull();
    expect(resultNumber({ value: null })).toBeNull();
    expect(resultNumber('')).toBeNull();
    expect(resultNumber('  ')).toBeNull();
  });

  it('texto que não é número é null', () => {
    expect(resultNumber('2026-07-31')).toBeNull();
    expect(resultNumber({ nada: 1 })).toBeNull();
  });
});

describe('sameValue', () => {
  it('tolera o arredondamento de NUMERIC para double', () => {
    expect(sameValue(1234.56, 1234.56 + 1e-10)).toBe(true);
    expect(sameValue(0, 0)).toBe(true);
  });

  it('reprova diferença real', () => {
    expect(sameValue(12.06, 7.0)).toBe(false);
    expect(sameValue(0, 0.01)).toBe(false);
  });

  /*
   * Não dá para provar uma série contra um valor que não existe. Ausência dos
   * dois lados também reprova: "null = null" não é uma medição que bateu.
   */
  it('ausência nunca é igualdade', () => {
    expect(sameValue(null, 0)).toBe(false);
    expect(sameValue(0, null)).toBe(false);
    expect(sameValue(null, null)).toBe(false);
  });
});
