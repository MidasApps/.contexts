import { describe, it, expect } from 'vitest';
import { formatNumber } from '@/shared/lib/format';
import {
  limitDistance, limitScale, limitBands, fractionOnScale,
} from '../limit-scale';

/**
 * A régua de "valor contra limite" — usada pelo gauge e pelo targets.
 *
 * É aritmética pura e vive fora dos componentes por isso, e porque os dois
 * precisam da MESMA regra: duas implementações da mesma classificação é como
 * `addBlock` e `moveBlock` chegaram a discordar sobre o que cabe numa linha.
 */
describe('limitScale', () => {
  it('sem escala declarada, o limite cai no meio da régua', () => {
    const scale = limitScale({ limit: 1.2, value: 1.38 });
    expect(scale).toEqual({ min: 0, max: 2.4 });
    expect(fractionOnScale(1.2, scale)).toBeCloseTo(0.5, 5);
  });

  /**
   * O defeito que a tela denunciou: Índice Recebível em 8,31x contra mínimo de
   * 1,20x. Numa régua fixa em 2× o limite (2,4), o valor estoura o teto, o
   * medidor trava em 100% e o desenho afirma "no limite" sobre um indicador
   * sete vezes acima dele.
   */
  it('a régua acompanha o valor quando ele passa do dobro do limite', () => {
    const scale = limitScale({ limit: 1.2, value: 8.31 });
    expect(scale.max).toBeGreaterThan(8.31);

    const f = fractionOnScale(8.31, scale);
    expect(f, 'o valor não pode encostar na borda').toBeLessThan(1);
    expect(f).toBeGreaterThan(0.8);

    // E a marca do limite desliza para a esquerda — a leitura de "muito acima".
    expect(fractionOnScale(1.2, scale)).toBeLessThan(0.2);
  });

  it('escala declarada vence as duas regras automáticas', () => {
    const scale = limitScale({ limit: 80, value: 62, scaleMin: 0, scaleMax: 100 });
    expect(scale).toEqual({ min: 0, max: 100 });
    expect(fractionOnScale(62, scale)).toBeCloseTo(0.62, 5);
  });

  it('limite e valor em zero ainda produzem uma régua desenhável', () => {
    const scale = limitScale({ limit: 0, value: 0 });
    expect(scale.max).toBeGreaterThan(scale.min);
  });

  it('valor negativo não inverte a régua', () => {
    const scale = limitScale({ limit: 1.2, value: -3 });
    expect(scale.max).toBeGreaterThan(scale.min);
    expect(fractionOnScale(-3, scale)).toBe(0);
  });
});

describe('limitBands', () => {
  it('escala normal: ruptura à esquerda, positivo à direita, sem buraco', () => {
    const scale = limitScale({ limit: 1.2, value: 1.38 });
    const bands = limitBands({ limit: 1.2, warning: 1.5, scale });

    expect(bands.map((f) => f.tone)).toEqual(['ruptura', 'atencao', 'positivo']);
    expect(bands[0]!.de).toBe(0);
    expect(bands[bands.length - 1]!.ate).toBe(1);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]!.de).toBeCloseTo(bands[i - 1]!.ate, 5);
    }
  });

  it('escala invertida: positivo à esquerda, ruptura à direita', () => {
    const scale = limitScale({ limit: 0.15, value: 0.084 });
    const bands = limitBands({ limit: 0.15, warning: 0.12, invertedScale: true, scale });
    expect(bands.map((f) => f.tone)).toEqual(['positivo', 'atencao', 'ruptura']);
  });

  it('sem faixa de atenção, a de âmbar não é desenhada', () => {
    const scale = limitScale({ limit: 1.2, value: 1.38 });
    expect(limitBands({ limit: 1.2, scale }).map((f) => f.tone))
      .toEqual(['ruptura', 'positivo']);
  });
});

describe('limitDistance', () => {
  const fmt = (n: number, c: number) => formatNumber(n, c);

  /**
   * Percentual é a forma certa PERTO do limite e ridícula longe dele. A tela
   * mostrou "folga de 592,3%" para 8,31x contra 1,20x — número correto que
   * ninguém processa.
   */
  it('perto do limite, fala em percentual', () => {
    expect(limitDistance({ value: 1.38, limit: 1.2, formatNumber: fmt }).text)
      .toMatch(/folga de 15,0%/);
  });

  it('acima do dobro, fala em múltiplo', () => {
    const d = limitDistance({ value: 8.31, limit: 1.2, formatNumber: fmt });
    expect(d.text).toMatch(/6,9× o mínimo/);
    expect(d.text).not.toMatch(/%/);
  });

  it('rompido, diz o quanto falta em percentual', () => {
    expect(limitDistance({ value: 0.94, limit: 1.2, formatNumber: fmt }).text)
      .toMatch(/abaixo em 21,7%/);
  });

  it('muito abaixo, também fala em múltiplo', () => {
    expect(limitDistance({ value: 0.3, limit: 1.2, formatNumber: fmt }).text)
      .toMatch(/0,25× o mínimo/);
  });

  /** Num teto, "0,56× o máximo" não é frase de mesa — percentual serve. */
  it('escala invertida sempre usa percentual', () => {
    const d = limitDistance({
      value: 0.084, limit: 0.15, invertedScale: true, formatNumber: fmt,
    });
    expect(d.text).toMatch(/folga de 44,0%/);
  });

  it('limite zero não produz frase — "Infinity%" é pior que omitir', () => {
    expect(limitDistance({ value: 10, limit: 0, formatNumber: fmt }).text).toBe('');
  });
});
