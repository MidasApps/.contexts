'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  open,
  title,
  description,
  defaultValue = '',
  placeholder,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [open, defaultValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-[15px]">{title}</DialogTitle>
          {description && <DialogDescription className="text-muted-foreground">{description}</DialogDescription>}
        </DialogHeader>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          placeholder={placeholder}
          className="h-9 w-full rounded-md bg-muted/50 border border-border px-3 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40"
        />
        <DialogFooter>
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-[15px]">{title}</DialogTitle>
          {description && <DialogDescription className="text-muted-foreground">{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              destructive
                ? 'bg-red-500 text-destructive-foreground hover:bg-red-600'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
