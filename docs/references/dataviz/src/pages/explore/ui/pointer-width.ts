import { GRID_COLUMNS, type WidthRange } from '@/features/report-authoring/schema/block-specs';

/**
 * Onde o ponteiro caiu, em colunas do grid de 6.
 *
 * Existe como módulo puro porque os DOIS controles de largura fazem a mesma
 * pergunta com geometrias diferentes: a régua mede dentro da própria trilha de
 * seis segmentos, o puxador mede a largura arrastada contra a calha da grade.
 * Escritas dentro de cada componente, as duas contas divergiriam — foi assim
 * que `addBlock` e `moveBlock` chegaram a discordar sobre o que cabe numa
 * linha. Aqui elas dividem o mesmo limitador e o mesmo teste.
 *
 * Nenhuma das duas toca no DOM: quem mede rect é o componente, e o que chega
 * aqui já é número.
 */

/** Aplica a faixa do contrato do bloco — nunca abaixo do mínimo legível. */
function clampToRange(columns: number, range: WidthRange): number {
  return Math.min(Math.max(columns, range.min), range.max);
}

/**
 * Coluna escolhida na régua.
 *
 * @param offset  px do ponteiro a partir da borda esquerda da régua.
 * @param rulerWidth px da régua inteira (os seis segmentos).
 *
 * `ceil` e não `round`: o primeiro pixel do primeiro segmento já vale 1/6.
 * Com `round`, a metade esquerda do primeiro segmento devolveria 0 — um valor
 * que não existe — e a régua pareceria morta perto da borda.
 */
export function columnOnRuler(
  offset: number,
  rulerWidth: number,
  range: WidthRange,
): number {
  if (rulerWidth <= 0) return range.min;
  const segment = rulerWidth / GRID_COLUMNS;
  const raw = Math.ceil(offset / segment);
  return clampToRange(Math.max(raw, 1), range);
}

/**
 * Largura pedida pelo puxador na borda direita.
 *
 * @param drag px entre a borda esquerda do bloco e o ponteiro.
 * @param step   px entre o início de uma coluna e o da seguinte (coluna + calha).
 * @param gutter   px de `gap` da grade.
 *
 * Um bloco de n colunas mede `n·coluna + (n−1)·calha`, então a conta inversa
 * soma uma calha antes de dividir pelo passo — sem isso o puxador pede sempre
 * uma coluna a menos nas larguras grandes, onde as calhas somadas já passam de
 * meia coluna.
 */
export function columnAtHandle(
  drag: number,
  step: number,
  gutter: number,
  range: WidthRange,
): number {
  if (step <= 0) return range.min;
  const raw = Math.round((drag + gutter) / step);
  return clampToRange(Math.max(raw, 1), range);
}
