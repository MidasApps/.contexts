import { describe, it, expect } from 'vitest';
import { columnOnRuler, columnAtHandle } from '../pointer-width';
import type { WidthRange } from '@/features/report-authoring/schema/block-specs';

/** Faixa aberta: o bloco aceita qualquer largura do grid. */
const FREE: WidthRange = { min: 1, recommended: 2, max: 6 };
/** Faixa de gráfico: abaixo de 3/6 a área de plotagem some. */
const CHART: WidthRange = { min: 3, recommended: 3, max: 6 };

describe('columnOnRuler', () => {
  const WIDTH = 120; // 6 segmentos de 20px

  it('devolve 1 no primeiro pixel do primeiro segmento', () => {
    expect(columnOnRuler(0, WIDTH, FREE)).toBe(1);
    expect(columnOnRuler(1, WIDTH, FREE)).toBe(1);
  });

  it('mapeia cada segmento para a sua coluna', () => {
    expect(columnOnRuler(19, WIDTH, FREE)).toBe(1);
    expect(columnOnRuler(21, WIDTH, FREE)).toBe(2);
    expect(columnOnRuler(61, WIDTH, FREE)).toBe(4);
    expect(columnOnRuler(120, WIDTH, FREE)).toBe(6);
  });

  it('não passa do máximo quando o ponteiro sai pela direita', () => {
    expect(columnOnRuler(400, WIDTH, FREE)).toBe(6);
  });

  it('respeita o mínimo do contrato do bloco', () => {
    expect(columnOnRuler(0, WIDTH, CHART)).toBe(3);
    expect(columnOnRuler(25, WIDTH, CHART)).toBe(3);
    expect(columnOnRuler(85, WIDTH, CHART)).toBe(5);
  });

  it('devolve o mínimo quando a régua ainda não foi medida', () => {
    expect(columnOnRuler(50, 0, CHART)).toBe(3);
  });
});

describe('columnAtHandle', () => {
  // Grade de 1000px com calha de 16: coluna = (1000 − 5·16) / 6 = 153,33; passo = 169,33.
  const STEP = (1000 + 16) / 6;
  const GUTTER = 16;

  /** A largura que um bloco de n colunas realmente ocupa. */
  const widthOf = (n: number) => n * (STEP - GUTTER) + (n - 1) * GUTTER;

  it('devolve a mesma coluna quando o ponteiro está na borda exata do bloco', () => {
    for (let n = 1; n <= 6; n += 1) {
      expect(columnAtHandle(widthOf(n), STEP, GUTTER, FREE)).toBe(n);
    }
  });

  it('só troca de coluna depois de meio passo — arrastar 10px não redimensiona', () => {
    expect(columnAtHandle(widthOf(2) + 10, STEP, GUTTER, FREE)).toBe(2);
    expect(columnAtHandle(widthOf(2) + STEP * 0.6, STEP, GUTTER, FREE)).toBe(3);
  });

  it('não desce abaixo de 1 quando o ponteiro cruza a borda esquerda', () => {
    expect(columnAtHandle(-500, STEP, GUTTER, FREE)).toBe(1);
  });

  it('respeita a faixa do contrato nos dois extremos', () => {
    expect(columnAtHandle(widthOf(1), STEP, GUTTER, CHART)).toBe(3);
    expect(columnAtHandle(widthOf(9), STEP, GUTTER, CHART)).toBe(6);
  });

  it('devolve o mínimo quando a grade ainda não foi medida', () => {
    expect(columnAtHandle(300, 0, GUTTER, CHART)).toBe(3);
  });
});
