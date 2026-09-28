'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual de destruição (vermelho + ícone de alerta). Default: false. */
  destructive?: boolean;
  /** Promise-based — se rejeitar, o erro é exibido no próprio modal. */
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setPending(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="size-4 text-destructive" />}
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground whitespace-pre-line">{description}</div>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={pending}
            className={
              destructive
                ? 'bg-red-500 text-destructive-foreground hover:bg-red-500/90'
                : undefined
            }
          >
            {pending ? 'Aguarde…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
