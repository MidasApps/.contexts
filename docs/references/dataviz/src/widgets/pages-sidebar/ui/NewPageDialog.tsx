'use client';

import { FileText, LayoutTemplate } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';

export interface NewPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cria uma página vazia e abre direto no modo de edição. */
  onBlank: () => void;
  /** Fecha este seletor e abre a galeria de templates. */
  onTemplate: () => void;
}

/**
 * Seletor de como criar uma página: vazia ou a partir de um template.
 *
 * É o único ponto de entrada para criar página — antes as duas formas eram
 * botões separados no rodapé da coluna, o que espalhava a mesma decisão em
 * dois lugares e não deixava claro que eram alternativas.
 */
export function NewPageDialog({ open, onOpenChange, onBlank, onTemplate }: NewPageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[520px] border-border bg-popover text-foreground">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Nova página</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onBlank}
            className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <FileText className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <span className="text-[13px] font-semibold text-foreground">Em branco</span>
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              Página vazia, aberta direto no modo de edição.
            </span>
          </button>

          <button
            onClick={onTemplate}
            className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <LayoutTemplate className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <span className="text-[13px] font-semibold text-foreground">Template</span>
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              Escolher um modelo pronto da galeria.
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
