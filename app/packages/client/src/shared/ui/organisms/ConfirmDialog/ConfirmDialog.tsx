"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/shared/ui/molecules/AlertDialog/AlertDialog.tsx";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Irreversible action: destructive button (Cancel keeps the initial focus either way). */
  destructive?: boolean;
  /**
   * Runs the action. The dialog stays open with a pending button until it settles and closes on
   * success; on failure it stays open so the caller can show the error (toast or inline).
   */
  onConfirm: () => Promise<boolean | void> | boolean | void;
  /** Inline error from the last attempt (translated), announced as an alert inside the dialog. */
  error?: string | undefined;
};

/**
 * Confirmation organism over AlertDialog for destructive or consequential actions (remove member,
 * revoke key, delete unit). Async-aware: pending state, no double submit, focus returns to the
 * trigger on close.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  error,
}: ConfirmDialogProps) {
  const t = useTranslations("common.actions");
  const [pending, setPending] = useState(false);
  // Usually opened from a menu item or row action, not an AlertDialogTrigger, so Radix has no
  // trigger to return focus to: remember what had focus when it opened (rules/accessibility.md).
  const returnFocus = useRef<HTMLElement | null>(null);
  const confirm = async (): Promise<void> => {
    setPending(true);
    try {
      const result = await onConfirm();
      if (result !== false) onOpenChange(false);
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current === null || !returnFocus.current.isConnected) return;
          event.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error === undefined ? null : (
          <p role="alert" className="text-sm font-medium text-destructive-text">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel ?? t("cancel")}</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} pending={pending} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
