import { describe, it, expect } from 'vitest';
import { GRID_COLUMNS } from '@/features/report-authoring/schema/block-specs';
import { GRID_CLASS, widthStyle } from '../block-grid';

describe('grade de blocos', () => {
  /*
   * O Tailwind varre classes estáticas, então `grid-cols-6` é literal e o
   * compilador não liga o número ao contrato. Este teste é a ligação: mudar
   * `GRID_COLUMNS` sem mudar a classe quebra aqui, e não numa tela em que
   * metade dos blocos vaza para fora da página.
   */
  it('a classe da grade tem o número de colunas que o contrato declara', () => {
    expect(GRID_CLASS).toContain(`grid-cols-${GRID_COLUMNS}`);
  });

  it('a largura vira span de coluna', () => {
    expect(widthStyle(3)).toEqual({ gridColumn: 'span 3' });
    expect(widthStyle(GRID_COLUMNS)).toEqual({ gridColumn: `span ${GRID_COLUMNS}` });
  });

  /*
   * Largura fora da grade não é hipótese: é o que já existe em documento
   * gravado por template antigo. Sem o teto, um `colSpan: 8` faz o bloco
   * ocupar a linha inteira E empurrar o vizinho para a linha seguinte; sem o
   * piso, `0` some com o bloco.
   */
  it('largura fora da grade é contida, não propagada', () => {
    expect(widthStyle(9)).toEqual({ gridColumn: `span ${GRID_COLUMNS}` });
    expect(widthStyle(0)).toEqual({ gridColumn: 'span 1' });
    expect(widthStyle(-2)).toEqual({ gridColumn: 'span 1' });
    expect(widthStyle(2.4)).toEqual({ gridColumn: 'span 2' });
  });
});
