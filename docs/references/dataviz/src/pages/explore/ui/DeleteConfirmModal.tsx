'use client';

import { useEffect, useRef } from 'react';

interface DeleteConfirmModalProps {
  blockName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ blockName, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-popover p-5 shadow-2xl">
        <h3 className="text-sm font-semibold text-foreground">Excluir bloco?</h3>
        <p className="mt-1.5 text-xs text-muted-foreground/80">
          O bloco &ldquo;{blockName}&rdquo; será removido permanentemente.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-3.5 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-red-600"
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
