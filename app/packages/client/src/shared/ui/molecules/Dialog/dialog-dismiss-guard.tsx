"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
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

/**
 * What a user-initiated dismissal (Esc, a click outside, the X, a `DialogClose`) may do:
 * - `allow`: close (the default).
 * - `block`: work is in flight (a create request, an upload); nothing closes and the X is hidden.
 * - `confirmUnsaved`: typed work would be lost; ask "Discard changes?" first.
 * - `confirmOneTime`: a value shown only once (secret, link, code) would be lost; ask first.
 * Programmatic closes (`onOpenChange(false)` from the owner, e.g. after a save) are never guarded.
 */
export type DialogDismissGuard = "allow" | "block" | "confirmUnsaved" | "confirmOneTime";

type GuardContext = { guard: DialogDismissGuard; declare: (id: string, guard: DialogDismissGuard | null) => void };

const DismissGuardContext = createContext<GuardContext | null>(null);

/** Several parts may declare at once (a body blocks while sending, its child guards a secret): the strictest wins. */
const STRICTNESS: readonly DialogDismissGuard[] = ["allow", "confirmUnsaved", "confirmOneTime", "block"];
const strictest = (guards: Iterable<DialogDismissGuard>): DialogDismissGuard =>
  [...guards].reduce<DialogDismissGuard>((winner, guard) => (STRICTNESS.indexOf(guard) > STRICTNESS.indexOf(winner) ? guard : winner), "allow");

/**
 * Declares, from anywhere inside a `Dialog`, how a dismissal is handled while the caller is
 * mounted (bodies unmount on close, which drops the declaration). Outside a `Dialog` it does nothing.
 */
export function useDialogDismissGuard(guard: DialogDismissGuard): void {
  const declare = useContext(DismissGuardContext)?.declare;
  const id = useId();
  useEffect(() => {
    if (declare === undefined) return undefined;
    declare(id, guard);
    return () => declare(id, null);
  }, [declare, id, guard]);
}

/** The current guard, for the kit's own parts (the close button hides while blocked). */
export function useCurrentDismissGuard(): DialogDismissGuard {
  return useContext(DismissGuardContext)?.guard ?? "allow";
}

/** Owner side, used by `Dialog`: turns a dismissal request into close, nothing, or a question. */
export function useDismissGuardState(close: () => void) {
  const [declared, setDeclared] = useState<ReadonlyMap<string, DialogDismissGuard>>(new Map());
  const [asking, setAsking] = useState<"confirmUnsaved" | "confirmOneTime" | null>(null);
  const declare = useCallback((id: string, guard: DialogDismissGuard | null) => {
    setDeclared((current) => {
      const next = new Map(current);
      if (guard === null) next.delete(id);
      else next.set(id, guard);
      return next;
    });
  }, []);
  const guard = strictest(declared.values());
  const requestDismiss = (): void => {
    if (guard === "allow") return close();
    if (guard === "block") return;
    setAsking(guard);
  };
  return { context: { guard, declare }, asking, setAsking, requestDismiss };
}

export function DismissGuardProvider({ value, children }: { value: GuardContext; children: ReactNode }) {
  return <DismissGuardContext value={value}>{children}</DismissGuardContext>;
}

type DiscardQuestionProps = {
  asking: "confirmUnsaved" | "confirmOneTime" | null;
  onKeep: () => void;
  onDiscard: () => void;
};

/**
 * "Discard?" question stacked over the dialog. Esc or "keep" closes only the question and puts
 * focus back where it was; "discard" closes both and the dialog returns focus to its trigger.
 */
export function DiscardQuestion({ asking, onKeep, onDiscard }: DiscardQuestionProps) {
  const t = useTranslations("common.dialogGuard");
  const returnFocus = useRef<HTMLElement | null>(null);
  const discarding = useRef(false);
  const copy = asking === "confirmOneTime" ? "oneTime" : "unsaved";
  return (
    <AlertDialog open={asking !== null} onOpenChange={(next) => !next && onKeep()}>
      <AlertDialogContent
        onOpenAutoFocus={() => {
          discarding.current = false;
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (discarding.current || returnFocus.current === null || !returnFocus.current.isConnected) return;
          returnFocus.current.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${copy}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`${copy}.description`)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t(`${copy}.cancel`)}</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => {
              discarding.current = true;
              onDiscard();
            }}
          >
            {t(`${copy}.confirm`)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
