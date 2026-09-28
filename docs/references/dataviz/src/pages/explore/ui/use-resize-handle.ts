'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GRID_COLUMNS, type WidthRange } from '@/features/report-authoring/schema/block-specs';
import { columnAtHandle } from './pointer-width';

/**
 * Arrastar a borda direita do bloco para mudar a largura.
 *
 * A largura NÃO vai ao store a cada pixel: durante o arrasto vive aqui como
 * `preview`, e só o valor final é gravado. Escrever a cada quadro faria uma
 * dezena de writes por arrasto — cada um recompondo a página inteira e
 * empilhando estados intermediários que ninguém quis.
 *
 * O teclado NÃO passa por aqui: quem redimensiona sem mouse é a régua do
 * trilho, que é um slider de verdade. Por isso o puxador pode ser
 * `aria-hidden` — ele é atalho de ponteiro para uma função que já tem controle
 * acessível na mesma barra (exceção "equivalente" da WCAG 2.5.8).
 */
export function useResizeHandle({
  gradeRef,
  cellRef,
  range,
  width,
  onRelease,
  onStateChange,
}: {
  /** A grade de 6 colunas — de onde saem a calha e o passo entre colunas. */
  gradeRef: React.RefObject<HTMLElement | null>;
  /** A célula deste bloco — de onde sai a origem do arrasto. */
  cellRef: React.RefObject<HTMLElement | null>;
  range: WidthRange;
  width: number;
  onRelease: (columns: number) => void;
  /** Liga e desliga as guias de coluna da grade. */
  onStateChange: (isResizing: boolean) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const unmount = useRef<(() => void) | null>(null);

  // Arrasto em curso quando o bloco sai da tela (a IA remove o bloco, o
  // usuário troca de página): sem isto os listeners de window sobrevivem ao
  // componente e o cursor fica travado em `col-resize`.
  useEffect(() => () => unmount.current?.(), []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const grade = gradeRef.current;
    const cell = cellRef.current;
    if (!grade || !cell) return;
    e.preventDefault();
    e.stopPropagation();

    const gutter = Number.parseFloat(getComputedStyle(grade).columnGap) || 0;
    // Passo = distância entre o início de uma coluna e o da seguinte. Lido da
    // grade viva em vez de uma constante: se a calha mudar, a conta acompanha.
    const step = (grade.getBoundingClientRect().width + gutter) / GRID_COLUMNS;
    /*
     * A origem é congelada no pointerdown, de propósito.
     *
     * Um bloco que cresce pode não caber mais na linha e refluir para a
     * seguinte, o que muda o `left` da célula no meio do arrasto. Relendo a
     * origem a cada quadro, a largura pedida saltaria entre dois valores e o
     * puxador brigaria com o ponteiro.
     */
    const origem = cell.getBoundingClientRect().left;

    let chosen = width;
    onStateChange(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const move = (ev: PointerEvent) => {
      const next = columnAtHandle(ev.clientX - origem, step, gutter, range);
      if (next === chosen) return;
      chosen = next;
      setPreview(next);
    };

    const release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      unmount.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onStateChange(false);
      if (chosen !== width) onRelease(chosen);
      setPreview(null);
    };

    unmount.current = release;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }, [gradeRef, cellRef, range, width, onRelease, onStateChange]);

  return { preview, onPointerDown };
}
