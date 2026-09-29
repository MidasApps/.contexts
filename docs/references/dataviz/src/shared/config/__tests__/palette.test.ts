import { describe, it, expect } from 'vitest';
import { CHART_COLORS, CHART_PALETTE, seriesColor } from '../chart-theme';

/**
 * A paleta é medida, não julgada a olho.
 *
 * A anterior punha `#F3A169` e `#D4976A` nas duas primeiras posições — dois
 * laranjas a 0,060 de distância em OKLab, indistinguíveis no quadrado de 8px de
 * uma legenda. Como o caso mais comum do produto é um gráfico de duas séries,
 * o pior par da paleta era exatamente o mais usado. Quatro das oito cores
 * colapsavam entre si sob deuteranopia (ΔE 0,011), e o amarelo `#F2CB6E` tinha
 * 1,55:1 contra o fundo branco: uma linha invisível no tema claro.
 *
 * Nada disso aparece numa captura de tela revisada por quem enxerga as oito
 * cores num monitor bom. Por isso vive aqui, como número.
 *
 * As funções abaixo são a matemática de cor mínima para as asserções — OKLab
 * (Björn Ottosson) para distância perceptual, Viénot 1999 para dicromacia e
 * WCAG 2.x para contraste. Não vale a pena um módulo de produção: nada além
 * deste teste precisa delas.
 */

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function distance(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(hex: string, background: string): number {
  const a = luminance(hex) + 0.05;
  const b = luminance(background) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

/** Como um dicromata vê a cor (Viénot 1999, em espaço LMS). */
function simulateDichromacy(hex: string, kind: 'deutan' | 'protan'): string {
  const [r, g, b] = rgb(hex).map(toLinear) as [number, number, number];
  let L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  let M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;
  if (kind === 'protan') L = 2.02344 * M - 2.52581 * S;
  else M = 0.494207 * L + 1.24827 * S;

  const channel = (v: number) => {
    const c = Math.min(Math.max(v, 0), 1);
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(Math.max(s, 0), 1) * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0.080944 * L - 0.130504 * M + 0.116721 * S)}`
    + `${channel(-0.0102485 * L + 0.0540194 * M - 0.113615 * S)}`
    + `${channel(-0.000365294 * L - 0.00412163 * M + 0.693513 * S)}`;
}

/** O pior par de um conjunto — a cor que ficou perto demais de outra. */
function worstPair(colors: readonly string[], transform: (c: string) => string = (c) => c) {
  let worst = { d: Infinity, a: '', b: '' };
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const d = distance(transform(colors[i]!), transform(colors[j]!));
      if (d < worst.d) worst = { d, a: colors[i]!, b: colors[j]! };
    }
  }
  return worst;
}

const DARK_BACKGROUND = '#080809';
const LIGHT_BACKGROUND = '#ffffff';

describe('paleta de séries', () => {
  it('a marca não se mexe', () => {
    expect(CHART_COLORS.primary).toBe('#F3A169');
    expect(CHART_COLORS.secondary).toBe('#76614C');
    expect(CHART_PALETTE[0]).toBe(CHART_COLORS.primary);
  });

  it('não repete cor', () => {
    expect(new Set(CHART_PALETTE).size).toBe(CHART_PALETTE.length);
  });

  /**
   * O invariante que importa: um gráfico de N séries usa as N PRIMEIRAS cores,
   * então cada prefixo precisa se sustentar sozinho. Otimizar a média da
   * paleta inteira não serve — deixa o caso de duas séries com o pior par.
   */
  it.each([
    [2, 0.25],
    [3, 0.19],
    [4, 0.15],
    [5, 0.10],
    [8, 0.09],
  ])('com %i séries, nenhum par fica abaixo de %f', (n, minimum) => {
    const worst = worstPair(CHART_PALETTE.slice(0, n));
    expect(worst.d, `${worst.a} e ${worst.b} estão perto demais`).toBeGreaterThanOrEqual(minimum);
  });

  /**
   * Cerca de 8% dos homens não separa vermelho de verde. Numa carteira de
   * crédito isso é a diferença entre "melhorou" e "piorou" — e o gráfico é
   * lido por quem decide.
   */
  it.each(['deutan', 'protan'] as const)('as cinco primeiras sobrevivem a %s', (kind) => {
    const worst = worstPair(CHART_PALETTE.slice(0, 5), (c) => simulateDichromacy(c, kind));
    expect(worst.d, `${worst.a} e ${worst.b} colapsam sob ${kind}`).toBeGreaterThanOrEqual(0.06);
  });

  /**
   * Um hex só serve aos DOIS temas — não há paleta por tema. Isso obriga
   * luminância média: o que brilha no escuro some no claro, e vice-versa.
   */
  it.each(CHART_PALETTE)('%s é visível nos dois temas', (color) => {
    expect(contrast(color, DARK_BACKGROUND), 'contraste no tema escuro').toBeGreaterThanOrEqual(3.2);
    expect(contrast(color, LIGHT_BACKGROUND), 'contraste no tema claro').toBeGreaterThanOrEqual(2.05);
  });

  it('a nona série volta ao começo em vez de ficar sem cor', () => {
    expect(seriesColor(0)).toBe(CHART_PALETTE[0]);
    expect(seriesColor(CHART_PALETTE.length)).toBe(CHART_PALETTE[0]);
    expect(seriesColor(CHART_PALETTE.length + 2)).toBe(CHART_PALETTE[2]);
  });
});
