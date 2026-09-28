import { describe, it, expect } from 'vitest';
import { tokenizeExpression, validateExpression, renderExpression } from './expression';

describe('expression', () => {
  it('tokeniza ids, números e operadores', () => {
    expect(tokenizeExpression('valor / area')).toEqual(['valor', '/', 'area']);
    expect(tokenizeExpression('(a + b) * 2')).toEqual(['(', 'a', '+', 'b', ')', '*', '2']);
  });
  it('rejeita caractere fora da gramática (anti-injeção: ponto/; bloqueados)', () => {
    expect(() => tokenizeExpression('contratos.valor')).toThrow();
    expect(() => tokenizeExpression('valor; DROP')).toThrow();
  });
  it('valida ids conhecidos e parênteses balanceados', () => {
    expect(() => validateExpression('valor / area', ['valor', 'area'])).not.toThrow();
    expect(() => validateExpression('valor / x', ['valor', 'area'])).toThrow();
    expect(() => validateExpression('(valor / area', ['valor', 'area'])).toThrow();
  });
  it('renderiza substituindo ids por SQL', () => {
    expect(renderExpression('valor / area', { valor: 'SUM(v)', area: 'SUM(a)' })).toBe('SUM(v) / SUM(a)');
  });
});
