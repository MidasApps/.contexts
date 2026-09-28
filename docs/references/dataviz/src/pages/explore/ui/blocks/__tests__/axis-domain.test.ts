import { describe, it, expect } from 'vitest';
import { axisDomain } from '../axis-domain';

/**
 * O eixo do boxplot não parte do zero, e por isso precisa escolher onde começa.
 * A escolha ingênua (`min - folga`) produz marcações como 23%, 43%, 63% — a
 * régua deixa de ser régua.
 */
describe('axisDomain', () => {
  it('contém os extremos', () => {
    const [floor, ceiling] = axisDomain(31, 95);
    expect(floor).toBeLessThanOrEqual(31);
    expect(ceiling).toBeGreaterThanOrEqual(95);
  });

  it('devolve limites múltiplos de um passo redondo', () => {
    // Amplitude 64 em 4 divisões → passo bruto 16 → passo redondo 10.
    expect(axisDomain(31, 95)).toEqual([30, 100]);
  });

  it('acompanha a ordem de grandeza — não fixa uma escala', () => {
    expect(axisDomain(0.31, 0.95)).toEqual([0.3, 1]);
    expect(axisDomain(3100, 9500)).toEqual([3000, 10000]);
  });

  /*
   * Todos os grupos com o mesmo valor: sem amplitude não há passo a arredondar,
   * e um domínio de largura zero desenha a caixa como uma linha na borda.
   */
  it('série constante ganha altura em vez de virar uma linha', () => {
    const [floor, ceiling] = axisDomain(50, 50);
    expect(ceiling).toBeGreaterThan(floor);
    expect(floor).toBeLessThan(50);
    expect(ceiling).toBeGreaterThan(50);
  });

  it('zero constante não colapsa nem divide por zero', () => {
    const [floor, ceiling] = axisDomain(0, 0);
    expect(Number.isFinite(floor)).toBe(true);
    expect(ceiling).toBeGreaterThan(floor);
  });

  it('valor não finito não propaga NaN para o eixo', () => {
    expect(axisDomain(Number.NaN, 10)).toEqual([0, 1]);
  });
});
