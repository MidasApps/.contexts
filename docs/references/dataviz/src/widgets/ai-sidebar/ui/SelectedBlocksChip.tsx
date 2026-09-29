'use client';

import { X } from 'lucide-react';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import type { CanvasBlock } from '@/shared/config/agents/types';

/** Título, rótulo, ou o id — nesta ordem. Um bloco sempre tem como ser citado. */
function blockName(block: CanvasBlock | undefined, id: string): string {
  const b = block as { title?: string; label?: string } | undefined;
  return b?.title?.trim() || b?.label?.trim() || id;
}

/**
 * O escopo da conversa, ao lado de onde se escreve.
 *
 * Selecionar blocos já restringia a IA — o supervisor recebe os ids e é
 * instruído a mexer só neles —, mas o único sinal disso vivia no canvas: o
 * esmaecimento dos outros blocos e a barra no rodapé. Quem estava com o olho
 * no chat mandava a mensagem sem saber que ela tinha escopo.
 */
export function SelectedBlocksChip() {
  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const pages = useCanvasStore((s) => s.pages);
  const clearSelection = useCanvasStore((s) => s.clearSelection);

  if (selectedBlockIds.length === 0) return null;

  const names = selectedBlockIds.map((id) => {
    const block = pages.find((p) => p.blockMap[id])?.blockMap[id];
    return blockName(block, id);
  });

  const label = selectedBlockIds.length === 1
    ? `Editando: ${names[0]}`
    : `Editando ${selectedBlockIds.length} blocos`;

  return (
    <div
      data-testid="escopo-da-selecao"
      // Os ids no title: quando a IA responde citando `kpi-saldo`, é por aqui
      // que se casa a resposta com o que está selecionado.
      title={`${names.join(' · ')}\n${selectedBlockIds.join(', ')}`}
      className="mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5"
    >
      <span className="min-w-0 flex-1 truncate text-[11px] text-primary">
        {label}
      </span>
      <button
        type="button"
        onClick={clearSelection}
        aria-label="Limpar seleção"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
      >
        <X className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  );
}
