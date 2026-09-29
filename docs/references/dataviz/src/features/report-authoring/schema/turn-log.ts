import type { CanvasBlock } from '@/shared/config/agents/types';
import { GRID_COLUMNS, fitsInRow, blockWidth, blockSpec } from './block-specs';

/**
 * Registro do que o modelo construiu neste turno.
 *
 * O modelo constrói às cegas a partir do segundo bloco: o inventário da página
 * que ele recebe é o retrato de quando a requisição chegou e nunca é reemitido,
 * e o resultado de cada tool é o eco do próprio input — ele aprende o `id`
 * sorteado e nada mais. Não sabe em que linha o bloco caiu, quanto sobrou nela,
 * nem quantos já criou.
 *
 * Como o empacotamento é determinístico (`fitsInRow`, a mesma regra que o
 * store aplica), dá para dizer isso a ele com precisão, no próprio resultado da
 * tool, sem nenhuma ida ao cliente.
 *
 * Escopo honesto: as linhas contadas aqui são as dos blocos criados NESTE turno,
 * que o canvas anexa após o conteúdo que já existia. O `pagesContext` não carrega
 * `colSpan`, então a ocupação das linhas antigas não é conhecida no servidor —
 * e inventá-la seria pior que não falar dela.
 */
export interface LayoutPosition {
  /** 1-based, contando só as linhas abertas neste turno. */
  linha: number;
  /** Colunas ocupadas nessa linha, incluindo este bloco. */
  ocupado: number;
  /** Colunas livres à direita. */
  livre: number;
  /** Frase pronta para o modelo ler. */
  resumo: string;
}

export interface TurnLog {
  register: (block: CanvasBlock) => LayoutPosition;
  /** Quantos blocos foram criados até agora neste turno. */
  total: () => number;
}

export function createTurnLog(): TurnLog {
  const rows: number[] = [];
  let created = 0;

  return {
    total: () => created,
    register(block) {
      created += 1;
      const width = blockWidth(block);
      const lastRow = rows.at(-1);

      if (lastRow !== undefined && fitsInRow(lastRow, width)) {
        rows[rows.length - 1] = lastRow + width;
      } else {
        rows.push(width);
      }

      const row = rows.length;
      const used = rows[row - 1] ?? width;
      const free = GRID_COLUMNS - used;
      const label = blockSpec(block.type).label;

      const summary = free === 0
        ? `${label} de ${width}/${GRID_COLUMNS} na linha ${row}, que fica completa.`
        : `${label} de ${width}/${GRID_COLUMNS} na linha ${row}; sobram ${free} `
          + `coluna${free > 1 ? 's' : ''} à direita. `
          + `O próximo bloco de até ${free} entra nessa mesma linha; acima disso, abre a próxima.`;

      return { linha: row, ocupado: used, livre: free, resumo: summary };
    },
  };
}
