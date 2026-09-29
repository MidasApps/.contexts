import { describe, it, expect } from 'vitest';
import { comparisonBand } from '../comparison-band';

/**
 * O cabeçalho do gráfico precisa dizer QUAL período o tracejado mostra.
 *
 * A legenda diz "(comparativo)" e some quando há três séries ou mais; o
 * tooltip nomeia um ponto por vez. Nenhum dos dois responde de relance.
 */
describe('comparisonBand', () => {
  it('sem dado, não há faixa', () => {
    expect(comparisonBand(undefined)).toBeNull();
    expect(comparisonBand([])).toBeNull();
  });

  it('sem série comparativa, não há faixa — o caso normal', () => {
    expect(comparisonBand([{ mes: '2026-05', saldo: 10 }])).toBeNull();
  });

  it('do primeiro ao último rótulo comparativo', () => {
    const data = [
      { mes: '2026-05', saldo: 10, __cmp_saldo: 8, __cmpRotulo: '2026-01' },
      { mes: '2026-06', saldo: 12, __cmp_saldo: 9, __cmpRotulo: '2026-02' },
      { mes: '2026-07', saldo: 14, __cmp_saldo: 7, __cmpRotulo: '2026-03' },
    ];
    expect(comparisonBand(data)).toBe('jan/26 – mar/26');
  });

  it('um mês só não vira faixa de um mês até ele mesmo', () => {
    const data = [{ mes: '2026-05', saldo: 10, __cmp_saldo: 8, __cmpRotulo: '2026-01' }];
    expect(comparisonBand(data)).toBe('jan/26');
  });

  /* O resolver pode não devolver o bucket. Dizer só "comparativo" continua
     sendo verdade; inventar um mês, não. */
  it('série comparativa sem rótulo ainda se identifica', () => {
    const data = [{ mes: '2026-05', saldo: 10, __cmp_saldo: 8 }];
    expect(comparisonBand(data)).toBe('comparativo');
  });
});
