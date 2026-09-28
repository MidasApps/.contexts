'use client';

import { useCanvasStore } from '@/shared/stores/canvas-store';

export function SelectionBar() {
  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const clearSelection = useCanvasStore((s) => s.clearSelection);

  if (selectedBlockIds.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-30 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 backdrop-blur-sm">
      {/*
        O que a seleção significa para a conversa é dito ao lado do campo de
        mensagem (`SelectedBlocksChip`), que é onde a pessoa está olhando na
        hora de escrever. Aqui fica só o que é do canvas: quantos estão
        marcados e como desmarcar todos — inclusive com o painel de chat
        fechado, quando o chip não existe na tela.
      */}
      <span className="text-xs text-primary">
        <strong>{selectedBlockIds.length}</strong>{' '}
        {selectedBlockIds.length === 1 ? 'bloco selecionado' : 'blocos selecionados'}
      </span>
      <button
        type="button"
        onClick={clearSelection}
        className="rounded-md border border-primary/30 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
      >
        Limpar seleção
      </button>
    </div>
  );
}
